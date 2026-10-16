import { estimateStarts, formatDuration, MAX_UNWITNESSED_MS } from "./timing";
import { formatTurnTime } from "./turn-time";
import { COUNT_LABELS, isLookKey, type LookKey } from "./vivid-model";

/**
 * 本地补丁：把连续的思考行和工具行折叠成一行。纯函数，不依赖 react-native，客户端、服务端和单元测试共用。
 *
 * 「段」= 两条 Agent 文字、用户消息或其他卡片（任务行、计划卡、审批卡、Bot 卡片、错误、压缩标记……）之间，
 * 由本插件接管的连续思考行和工具行。
 * - 已结束的段（后面已有其他内容，或 Agent 已停下）全部完成后，折叠成一行摘要；点开后整段恢复。
 * - 运行中的段只留运行中、等你批准、失败的行和最近两行，前面完成的步骤收成一行「前面 N 步」。
 */

export type StepStatus = "running" | "completed" | "failed" | "canceled";

/** One projected timeline entry, reduced to what folding needs. */
export interface IndexRow {
  /** `seqStart` of the projected entry: its position. */
  seq: number;
  /** `seqEnd`: the entry's last update. Defaults to `seq`. */
  seqEnd?: number;
  /** End time of the entry in ms (Paseo stamps merged entries with their last update). 0 when unknown. */
  at: number;
  /**
   * reasoning / tool: rows this plugin may draw. boundary: anything else the user sees (text, cards, task rows…).
   * skip: entries Paseo never shows (Claude's TaskCreate/TaskUpdate…); they neither join nor split a segment.
   */
  kind: "reasoning" | "tool" | "boundary" | "skip";
  /** Fold key of reasoning/tool rows (see `toolKey`/`reasoningKey`). */
  key?: string;
  status?: StepStatus;
  look?: LookKey;
  /** Claude Code task notification (Paseo's synthetic `task_notification` row). */
  notice?: { ref: string | null; foreground: boolean };
  /** Boundary kind, for debugging and tests. */
  what?: string;
  /**
   * 本地补丁（0.5.0）：这一行可能比它所属的这一轮活得久。子 Agent（Claude 的 Task、Codex 的子线程……）在父 Agent 停下来
   * 之后仍会继续跑并自己收尾，所以它挂着 running 不代表宿主漏了终态，不能按「孤儿行」处理。见 `isOrphanRunning`。
   */
  outlives?: boolean;
  /** Paseo's `turnId` of the entry (0.3.0-local.3): timing never reaches into an earlier turn, and a new turn starts a new segment. */
  turn?: string;
}

export interface FoldOptions {
  /** Which rows the plugin draws: in 仅思考行 tool rows are Paseo's and therefore boundaries. */
  scope: "all" | "reasoning";
  /** 「完成后折叠连续的思考与工具行」. Off: everything stays visible (foreground notices still merge). */
  enabled: boolean;
  /**
   * The Agent's turn is running: the trailing segment is still growing.
   *
   * 本地补丁（0.5.0）：宿主在中断一轮时不会给正在运行的工具行补一条终态（Claude 的 mapper 会补，Codex/ACP 不会），
   * 那条行就一直停在 running。Agent 已经停下（这里是 false）时不会再有任何东西来更新它，所以把这种「没人再管」的
   * running 行按 canceled 处理，摘要里的取消计数、行的颜色和转圈都跟着它走。真正的终态一旦到达（completed/failed/
   * canceled）就以它为准，这里不会插手。
   */
  agentRunning: boolean;
  /** The user's choice for a segment id; undefined = default (collapsed). */
  expanded?: (segment: string) => boolean | undefined;
  /**
   * Keys Paseo has projected (holds in its timeline) at least once. Paseo loads history in pages of 40 entries, so the start
   * of a segment may not be loaded yet: the summary sits on the first loaded row and counts only loaded rows, so expanding
   * shows exactly what it says. Absent = all.
   */
  present?: (key: string) => boolean;
  /** Keys other Agents claim differently (forks, identical reasoning text): never hidden, never a summary. */
  contested?: (key: string) => boolean;
  /** Known start of a turn (its user message is a row of its own; this is `turn_started` / `activeTurn.startedAt`). */
  turnStart?: (turn: string) => number | null;
  /** Rows seen running: a long duration of theirs is real even where no turn bounds it. */
  witnessed?: (key: string) => boolean;
  /** Tool call ids waiting for the user's approval. */
  waiting?: ReadonlySet<string>;
  /**
   * 本地补丁（0.5.0）：这一行是不是「被中断留下的」运行行（它所属的那一轮已经不是当前活跃轮）。给了它就以它为准，
   * 因为只看 `agentRunning` 会在新一轮开始后又把这些行当成在跑（宿主取消一轮时不会补终态）。
   */
  orphaned?: (key: string) => boolean;
  /** Most recent settled rows a running segment keeps visible besides its running ones (default 2). */
  keep?: number;
  /** Smallest finished segment that folds (default 2 steps). */
  minFold?: number;
  /** Smallest number of earlier steps worth a 「前面 N 步」 row (default 2). */
  minHidden?: number;
}

export interface FoldSummary {
  /** Segment id within the agent's timeline epoch (seq of its first row). */
  segment: string;
  /** done = the whole finished segment; earlier = the folded beginning of a running segment. */
  mode: "done" | "earlier";
  expanded: boolean;
  /** Steps in the segment (notices excluded). */
  steps: number;
  /** Steps the summary stands for: all of them (done) or the earlier ones (earlier). */
  hidden: number;
  /** Steps per look, most frequent first, of the steps the summary stands for. */
  counts: Array<[LookKey, number]>;
  failed: number;
  canceled: number;
  /** done: from the content before the segment to its last step; null when unknown. */
  durationMs: number | null;
  /** done: end time of the segment's last step (daemon clock, ms), the moment the step row was stamped. Null when unknown. */
  endedAt: number | null;
}

export type FoldRole = { kind: "show" } | { kind: "hide" } | { kind: "fold"; summary: FoldSummary };

export const SHOW: FoldRole = Object.freeze({ kind: "show" }) as FoldRole;
export const HIDE: FoldRole = Object.freeze({ kind: "hide" }) as FoldRole;

export interface SegmentInfo {
  id: string;
  keys: string[];
  sealed: boolean;
  running: boolean;
  mode: "done" | "earlier" | "open";
  anchor: string | null;
}

export interface FoldPlan {
  roles: Map<string, FoldRole>;
  segments: SegmentInfo[];
}

/** Fold key of a tool call row. */
export function toolKey(callId: string): string {
  return `t:${callId}`;
}

/** FNV-1a over UTF-16 code units, base 36. */
export function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** 0.4.1: reasoning longer than this is hashed by its first and last half of it only (the key keeps the full length). */
export const REASONING_KEY_SAMPLE = 64 * 1024;

/**
 * Fold key of a reasoning row: its raw text (length + hash). Reasoning carries no id; Paseo's live stream and its projected
 * timeline both concatenate the same chunks, so the texts agree. Identical texts in one agent are ambiguous and never fold.
 * The plugin server keys every reasoning row of a page each time it reads it, so a very long text is sampled: two texts
 * of the same length that differ only in the middle share a key, and like identical texts they then never fold.
 */
export function reasoningKey(text: string): string {
  const half = REASONING_KEY_SAMPLE / 2;
  const sample = text.length <= REASONING_KEY_SAMPLE ? text : text.slice(0, half) + text.slice(-half);
  return `r:${text.length.toString(36)}:${hashText(sample)}`;
}

/** Stable signature of a role, to tell whether a projected row needs drawing again. */
export function roleSignature(role: FoldRole): string {
  if (role.kind !== "fold") return role.kind === "hide" ? "h" : "s";
  const s = role.summary;
  return `f|${s.segment}|${s.mode}|${s.expanded ? 1 : 0}|${s.steps}|${s.hidden}|${s.failed}|${s.canceled}|${s.durationMs ?? ""}|${s.endedAt ?? ""}|${s.counts.map(([look, n]) => `${look}${n}`).join(",")}`;
}

interface Step {
  row: IndexRow;
  key: string;
  status: StepStatus;
  look: LookKey;
  /** A foreground notice whose tool row is known: always hidden, never counted. */
  merged: boolean;
  /** A notice: hidden with its segment, but not a step. */
  notice: boolean;
  /** Same key more than once in this timeline: never hidden, never a summary. */
  ambiguous: boolean;
}

interface Segment {
  steps: Step[];
  /** Turn of its rows (a new turn starts a new segment). */
  turn: string | undefined;
  /** Estimated start of its first row (shared/timing.ts); null when nothing before it is known. */
  startAt: number | null;
  /** Something follows the segment. */
  followed: boolean;
}

function isMember(row: IndexRow, scope: FoldOptions["scope"]): boolean {
  if (!row.key) return false;
  if (row.kind === "reasoning") return true;
  return row.kind === "tool" && scope === "all";
}

function callIdOf(key: string): string | null {
  return key.startsWith("t:") ? key.slice(2) : null;
}

function countLooks(steps: readonly Step[]): Array<[LookKey, number]> {
  const counts = new Map<LookKey, number>();
  for (const step of steps) counts.set(step.look, (counts.get(step.look) ?? 0) + 1);
  // Most frequent first; ties keep first appearance.
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

/** Splits the index into segments of consecutive member rows. */
function segmentRows(rows: readonly IndexRow[], options: FoldOptions): Segment[] {
  const occurrences = new Map<string, number>();
  const tools = new Set<string>();
  for (const row of rows) {
    if (!row.key) continue;
    occurrences.set(row.key, (occurrences.get(row.key) ?? 0) + 1);
    if (row.kind === "tool") tools.add(row.key);
  }
  const starts = estimateStarts(
    rows.map((row) => ({ seq: row.seq, seqEnd: row.seqEnd ?? row.seq, at: row.at, ...(row.turn !== undefined ? { turn: row.turn } : {}) })),
    options.turnStart,
  );
  const segments: Segment[] = [];
  let current: Segment | null = null;
  for (const row of rows) {
    if (row.kind === "skip") continue;
    if (!isMember(row, options.scope)) {
      if (current) {
        current.followed = true;
        current = null;
      }
      continue;
    }
    const key = row.key!;
    const ref = row.notice?.ref ? toolKey(row.notice.ref) : null;
    const merged = Boolean(row.notice?.foreground && ref && (tools.has(ref) || options.present?.(ref)));
    const step: Step = {
      row,
      key,
      status: row.kind === "reasoning" ? "completed" : row.status ?? "completed",
      look: row.kind === "reasoning" ? "think" : row.look ?? "other",
      merged,
      notice: Boolean(row.notice),
      ambiguous: (occurrences.get(key) ?? 0) > 1 || Boolean(options.contested?.(key)),
    };
    // An autonomous turn can follow a turn that ended on a tool row: the runs belong to different rounds.
    if (current && row.turn !== undefined && current.turn !== undefined && row.turn !== current.turn) {
      current.followed = true;
      current = null;
    }
    if (!current) {
      current = { steps: [], turn: row.turn, startAt: starts.get(row.seq) ?? null, followed: false };
      segments.push(current);
    }
    current.steps.push(step);
  }
  return segments;
}

function isPresent(step: Step, options: FoldOptions): boolean {
  return !options.present || options.present(step.key);
}

function isWaiting(step: Step, options: FoldOptions): boolean {
  const callId = callIdOf(step.key);
  return Boolean(callId && options.waiting?.has(callId));
}

/**
 * 本地补丁（0.5.0）：中断留下的孤儿运行行。
 *
 * 宿主取消一轮时只把 Agent 置回 idle，不会重写这一轮里还挂着 running 的 tool_call（见 0.5.0 的 CHANGELOG）。Agent 已停时，
 * 没人会再来更新这些行，所以把它们当作 canceled：不计入「运行中」，摘要里数进 canceled，行上也不再转圈。
 * 只对 agentRunning 为 false 生效；Agent 在跑时 running 就是真的在跑。
 */
export function isOrphanRunning(status: StepStatus, agentRunning: boolean, outlives = false): boolean {
  return status === "running" && !agentRunning && !outlives;
}

/** The status a step is shown with: its own, or canceled when it is an orphaned running row. */
function shownStatus(step: Step, options: FoldOptions): StepStatus {
  if (options.orphaned) return options.orphaned(step.key) ? "canceled" : step.status;
  return isOrphanRunning(step.status, options.agentRunning, step.row.outlives) ? "canceled" : step.status;
}

/** Computes every row's fold role for one agent timeline. Rows without a role show as usual. */
export function planFolds(rows: readonly IndexRow[], options: FoldOptions): FoldPlan {
  const keep = options.keep ?? 2;
  const minFold = options.minFold ?? 2;
  const minHidden = options.minHidden ?? 2;
  const roles = new Map<string, FoldRole>();
  const infos: SegmentInfo[] = [];
  for (const segment of segmentRows(rows, options)) {
    const first = segment.steps[0]!;
    const id = String(first.row.seq);
    for (const step of segment.steps) if (step.merged && !step.ambiguous) roles.set(step.key, HIDE);
    const foldable = segment.steps.filter((step) => !step.merged);
    const countable = foldable.filter((step) => !step.notice);
    const sealed = segment.followed || !options.agentRunning;
    // 本地补丁（0.5.0）：Agent 停下后残留的 running 行按 canceled 处理，不再让这一段看起来还在跑。
    const running = !sealed || foldable.some((step) => shownStatus(step, options) === "running" || isWaiting(step, options));
    const info: SegmentInfo = { id, keys: segment.steps.map((step) => step.key), sealed, running, mode: "open", anchor: null };
    infos.push(info);
    if (!options.enabled || foldable.length === 0) continue;
    const expanded = options.expanded?.(id) ?? false;

    if (!running) {
      // Rows that stay visible (ambiguous keys) are not part of what the summary stands for.
      const loaded = countable.filter((step) => !step.ambiguous && isPresent(step, options));
      if (loaded.length < minFold) continue;
      const anchor = foldable.find((step) => !step.ambiguous && isPresent(step, options));
      if (!anchor) continue;
      // Parallel calls can finish out of order: the run ends with whichever finished last.
      const end = Math.max(...segment.steps.map((step) => step.row.at));
      let durationMs = segment.startAt !== null && end > 0 && end >= segment.startAt ? end - segment.startAt : null;
      // Without turns (older hosts) the start may sit in an earlier round: hide a long total nobody saw running.
      if (durationMs !== null && durationMs > MAX_UNWITNESSED_MS && segment.turn === undefined && !segment.steps.some((step) => options.witnessed?.(step.key))) {
        durationMs = null;
      }
      const summary: FoldSummary = {
        segment: id,
        mode: "done",
        expanded,
        steps: loaded.length,
        hidden: loaded.length,
        counts: countLooks(loaded),
        failed: loaded.filter((step) => step.status === "failed").length,
        canceled: loaded.filter((step) => shownStatus(step, options) === "canceled").length,
        durationMs,
        endedAt: end > 0 ? end : null,
      };
      info.mode = "done";
      info.anchor = anchor.key;
      for (const step of foldable) {
        if (step.ambiguous) continue;
        roles.set(step.key, step === anchor ? { kind: "fold", summary } : expanded ? SHOW : HIDE);
      }
      continue;
    }

    // Running: keep running, waiting and failed rows plus the two most recent settled ones; fold the finished beginning.
    const live = (step: Step) => shownStatus(step, options) === "running" || isWaiting(step, options);
    const recent = new Set(foldable.filter((step) => !live(step)).slice(-keep));
    const earlier = foldable.filter((step) => !recent.has(step) && !step.ambiguous && !live(step) && step.status !== "failed");
    const earlierSteps = earlier.filter((step) => !step.notice && isPresent(step, options));
    if (earlierSteps.length < minHidden) continue;
    const anchor = earlier.find((step) => isPresent(step, options));
    if (!anchor) continue;
    const summary: FoldSummary = {
      segment: id,
      mode: "earlier",
      expanded,
      steps: countable.filter((step) => isPresent(step, options)).length,
      hidden: earlierSteps.length,
      counts: countLooks(earlierSteps),
      failed: 0,
      canceled: earlierSteps.filter((step) => shownStatus(step, options) === "canceled").length,
      durationMs: null,
      endedAt: null,
    };
    info.mode = "earlier";
    info.anchor = anchor.key;
    for (const step of earlier) roles.set(step.key, step === anchor ? { kind: "fold", summary } : expanded ? SHOW : HIDE);
  }
  return { roles, segments: infos };
}

/** A segment's duration in the same words as the rows; null below one second (replayed sessions stamp every row alike). */
export function formatFoldDuration(ms: number | null): string | null {
  return ms === null || !Number.isFinite(ms) || ms < 1000 ? null : formatDuration(ms);
}

/** Counts as shown: 「思考 2」「命令 5」…, unknown looks as 其他. */
export function foldCountParts(counts: ReadonlyArray<readonly [string, number]>): Array<{ look: LookKey; text: string }> {
  return counts.filter(([, n]) => n > 0).map(([look, n]) => {
    const key = isLookKey(look) ? look : "other";
    return { look: key, text: `${COUNT_LABELS[key]} ${n}` };
  });
}

/** The summary's lead words: 「12 步」 or 「前面 7 步」. */
export function foldTitle(summary: Pick<FoldSummary, "mode" | "steps" | "hidden">): string {
  return summary.mode === "earlier" ? `前面 ${summary.hidden} 步` : `${summary.steps} 步`;
}

/** Screen-reader label: 「展开 12 步：思考 2、命令 5，失败 1，用时 1 分 20 秒，结束于 2026年10月16日 10:25:25」. */
export function foldAccessibilityLabel(
  summary: Pick<FoldSummary, "mode" | "steps" | "hidden" | "expanded" | "failed" | "canceled" | "durationMs" | "endedAt"> & { counts: ReadonlyArray<readonly [string, number]> },
): string {
  const parts = foldCountParts(summary.counts).map((part) => part.text).join("、");
  const stamp = summary.mode === "done" ? formatTurnTime(summary.endedAt ?? 0) : "";
  const extras = [
    summary.failed > 0 ? `失败 ${summary.failed}` : null,
    summary.canceled > 0 ? `取消 ${summary.canceled}` : null,
    summary.mode === "done" ? (formatFoldDuration(summary.durationMs) ? `用时 ${formatFoldDuration(summary.durationMs)}` : null) : null,
    stamp ? `结束于 ${stamp}` : null,
  ].filter(Boolean);
  return `${summary.expanded ? "收起" : "展开"} ${foldTitle(summary)}${parts ? `：${parts}` : ""}${extras.length ? `，${extras.join("，")}` : ""}`;
}
