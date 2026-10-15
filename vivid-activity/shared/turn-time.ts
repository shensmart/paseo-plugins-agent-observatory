import { z } from "zod";

/**
 * 本地补丁：每一轮结束时，在这一轮末尾显示一行时刻。
 *
 * Paseo 只在悬停助手消息时用 tooltip 显示结束时刻；这里把同一时刻固化成一行的常显时间，回看聊天时能直接看到
 * 每一轮是什么时候结束的。行由插件服务端在 `agent.turn_ended` 时写进 Agent 时间线，所以会随会话持久化，重开聊天也在。
 *
 * 位置定在整轮末尾的取舍见 server/turn-time.ts：时间线只能 append，一行能落在哪里完全取决于什么时候写。
 */
export const TURN_TIME_RENDERER_KIND = "vivid-turn-time";
export const TURN_TIME_RENDERER_VERSION = 1;

export const turnTimeDataSchema = z.object({
  /** 这一轮结束的时刻（ms）。 */
  at: z.number().nonnegative(),
  /** Paseo 的 `turnId`；provider 没给时为 null。 */
  turnId: z.string().max(200).nullable(),
  outcome: z.enum(["completed", "failed", "canceled"]),
});

export type TurnTimeData = z.output<typeof turnTimeDataSchema>;

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * 「2026年10月15日 14:23:05」。
 *
 * 一直带年月日：会话可能横跨很多天，而回看时「昨天 23:59」这类相对说法会随查看时间变化，读起来容易错。
 * 折叠摘要行和每轮末尾那行都用这一个函数，两处格式永远一致。
 */
export function formatTurnTime(at: number): string {
  if (!Number.isFinite(at) || at <= 0) return "";
  const date = new Date(at);
  return (
    `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
