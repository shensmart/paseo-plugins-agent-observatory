# Changelog

## 0.4.5-local.8 (2026-10-16)

**Interrupted turns, second pass**

The first pass keyed off turn ownership and the agent's status. Two more shapes of the same symptom turned up while
testing, and they are the ones that actually happen most often:

- A stale client copy. The daemon's projected timeline already says the call is `completed`, but the terminal status
  never reached this row, so the client kept rendering its `running` snapshot: the row spun and its timer counted up
  for as long as you left it. The timeline index is now authoritative for rows the client still calls `running`: a
  call that reached a terminal status never returns to `running`, so a terminal status in the index wins. The index
  says nothing about a row it has not read, and then nothing is guessed.
- A row outside the index window. The index reads the tail 160 rows, so scrolling back to older rows left them with
  no turn to compare against. Those fall back to time: a row whose last update predates the active turn's start
  belongs to a turn that is over. With no active turn, a stopped agent is enough.
- The rendered status is what folding and the row's own timer use, so a corrected row also stops counting and folds
  as cancelled rather than live.

**Also**

- Turn and agent-status changes now notify row subscribers. Without it a row could be reclassified while its measured
  duration stayed identical, so nothing re-rendered and the spinner stayed.
- Fix a crash while rendering a cancelled sub-agent row: `parseSubAgentActionLog` threw `reading 'split'` on the
  `undefined` log such a row can carry.
- Fix a React hook-order bug introduced by the first pass: `useRowStamp()` was called from inside a conditional
  expression, so the hook count changed at the moment a row flipped to cancelled. The error surfaced inside the
  host's `useSettings` as `reading 'length'`, which made it look like a host bug. A static test now rejects any hook
  called from a conditional expression.

## 0.4.4-local.7 (2026-10-16)

**Interrupted turns**

- A row left at `running` by an interrupted turn no longer spins, and its timer stops. The host does not rewrite a
  `tool_call` that was still running when a turn was cancelled (Claude Code's mapper does; Codex and ACP providers do
  not), so the row stayed `running` forever and live-timed from its start.
- The test is by turn, not by agent status: a row counts as left behind only when the turn it belongs to is no longer
  the agent's active turn. Keying off `agent.status` alone brought those rows back to life the moment a new turn
  started. Rows whose turn is unknown (older hosts) fall back to the agent status, and a sub-agent row is never
  treated this way: it finishes on its own schedule, after its parent's turn ends.
- Such a row shows as 已取消, its duration and end-time labels are suppressed rather than invented, and folding counts
  it as cancelled instead of live. Thinking rows left at `streaming` by the same interruption stop reading as
  「思考中…」 too.
- The fold index carries the new `o` flag for rows that can outlive their turn (sub-agents); older clients ignore it.

**Fixes**

- `parseSubAgentActionLog` accepted only a string and threw `reading 'split'` on the `undefined` log a cancelled
  sub-agent row can carry, which failed the whole row's render. It now accepts `null`/`undefined` and returns an empty
  list, with a regression test.

## 0.4.3-local.6 (2026-10-16)

- The end-time row label now covers every activity row, not only folded summaries. A run that never reached the fold
  threshold (a single command, one thinking row) shows its own end time, which is exactly what was missing before: those
  rows are drawn by the normal activity header, so they never went through a summary.
- The time is the renderer's own `timestamp`, the same value the fold index carries as `at`, so this needs no extra
  request and no server change. Running rows show nothing, and nothing is backfilled.
- The setting is 活动行显示结束时刻 (still off by default; the stored key stays `foldTime`).

## 0.4.3-local.5 (2026-10-16)

- A folded summary row can show when the run ended, after its status mark: a clock icon and the same full date and
  time the turn row uses (`2026年10月16日 10:25:25`). The setting 折叠摘要行显示结束时刻 is off by default; there is no
  backfill and no extra request, because the end time of a run is already part of the fold index the client keeps for
  timing.

## 0.4.2-local.4 (2026-10-15)

- Turn time is now written once per turn, at the end of that turn. This is the only position that a row can hold
  reliably: the daemon's timeline only accepts appends (`agent.timeline.append.request`), so where a row lands is decided
  by when it is written.
- The previous revision wrote at the first row after a reply (a tool call, reasoning, the next reply). When a reply was
  followed by two tool calls, the row landed between them. Ending the turn is the one moment after which the turn
  produces nothing more, so the row always comes last.
- A row can never sit directly under a reply's text or before the calls it triggered: the tool call is recorded when it
  starts, so it is already in the timeline by the time the plugin hears about it.
- Removed the per-segment subscription and idle timer along with the overlay/measurement code from the earlier
  revisions. The server entry now writes one row from the `agent.turn_ended` hook.
- The setting is 每轮结束后显示时间 again. Still on by default, still applies to every device, and nothing is backfilled.

## 0.4.1 (2026-10-10)

Security hardening after an outside review of 0.4.0. Image previews, folding and timing work as before.

**Image previews**

- A preview request must name the agent whose chat shows the image, and the daemon must know that agent; otherwise
  nothing is read, not even the temp directory. A sub-agent's own view (`provider:<agent>:<subagent>`) uses its parent
  agent's working directory.
- The temp directory is `os.tmpdir()` alone. `/tmp` is added only on macOS, where agents and browser tools save
  screenshots and `os.tmpdir()` is a per-user folder. A `TMPDIR` that is `/` or contains the home directory is ignored.
- Files are read in 64 KB pieces and never past 3 MB plus one byte, even when a file grows after its size was checked.
  A file that does not start like a supported image is not read past its first 32 bytes, and its size is no longer
  reported.
- After opening, the plugin checks the file it actually opened. On Linux it reads the real path from `/proc/self/fd`,
  so a directory swapped for a link between the checks and the open is refused; elsewhere the checked path must still
  name the same device and inode, which narrows that window.
- A BMP needs a file size field that matches the file, a known DIB header size and a pixel data offset inside the file,
  not just `BM`.

**Parsing limits**

- Looking for JSON after a prefix in MCP and command output tries at most 8 `{`/`[` positions and only text up to
  100,000 characters. Crafted output with nested brackets could keep the app or the daemon busy for minutes.
- The fold index counts a tool call holding more than a million characters as "other" without parsing it, and keys
  reasoning longer than 64 K characters by its length and its first and last 32 K characters.

**Memory**

- The fold index, timings and pending-approval state of an agent none of whose rows has been on screen for 10 minutes
  are dropped, and read again when you come back.

**Tests**

- The Hermes bundle test writes into a private `mkdtemp` directory. The host fixture's agent and message ids are
  synthetic and its timestamps shifted to 2026-01-01.

## 0.4.0 (2026-10-10)

First public release, based on Colorful Agent Activity 0.3.0
([mcowger/paseo-plugins@e65409b](https://github.com/mcowger/paseo-plugins/tree/e65409bbccf6d07c1bbe24dc8eddd902ee10a769/colorful-agent-activity))
by Matt Cowger. Changes from that version:

**Packaging**

- New plugin id `vivid-activity`, so it is offered rows after plugins such as Bots (`paseo-bots`) that turn some tool
  calls into their own cards.
- `@getpaseo/protocol` and `prismjs` are runtime dependencies installed by the manifest's `npm ci --omit=dev`
  preparation step. Without them the original does not compile on Paseo 0.11.1 Git installs. The agent types that
  came from `@getpaseo/client` are now taken from the host SDK, so that package stays a development dependency.
- Requires Paseo 0.11.1.

**Look and states**

- Simplified Chinese interface, including names for 61 Paseo tools.
- New default "vivid" palette: one color and icon per kind of step; running blue with a spinner, waiting for approval
  amber, failed red with the exit code, finished green. The original palette remains as "follow theme".
- The row that waits for your approval is matched to its permission request.
- Motion listeners only on rows that move; a slightly stronger state tint in the light theme.

**Folding, density and timing**

- Finished runs of thinking and tool steps fold into one summary row; running runs keep only active, waiting, failed
  and the two latest steps open.
- Compact row density (4 px between rows) by default.
- Per-step durations estimated from the projected timeline and bounded by the agent's turn; live counters for
  running rows.

**Detail cards**

- Layered cards; command boxes with a program badge, exit code and copy buttons; file boxes with a language badge,
  line numbers and copy; a step rail for multi-step thinking.

**Behavior**

- A "takeover" setting: all rows, thinking rows only, or off.
- Plan cards and task lists are left to Paseo; the Activity Summary panel was removed.
- Claude Code failures show the error text instead of the raw tool result; MCP results wrapped as `{ output }` reach
  the GitHub, Exa and Paseo views; the task notice Claude Code adds after a command with a timeout merges into that
  command's row, and background command notices get a row of their own.
- Image previews only read files inside the agent's working directory or the system temp directory.
