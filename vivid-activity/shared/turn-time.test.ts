import { describe, expect, it } from "vitest";
import { formatTurnTime, turnTimeDataSchema } from "./turn-time";

describe("formatTurnTime", () => {
  it("always carries the calendar date", () => {
    expect(formatTurnTime(new Date(2026, 9, 15, 14, 5, 9).getTime())).toBe("2026年10月15日 14:05:09");
    // 同一天、昨天、更早，格式都一样：回看时不会因为「今天」变了而变。
    expect(formatTurnTime(new Date(2026, 9, 14, 23, 59, 59).getTime())).toBe("2026年10月14日 23:59:59");
    expect(formatTurnTime(new Date(2025, 11, 31, 8, 0, 0).getTime())).toBe("2025年12月31日 08:00:00");
  });

  it("returns an empty label for unusable timestamps", () => {
    expect(formatTurnTime(0)).toBe("");
    expect(formatTurnTime(Number.NaN)).toBe("");
  });

  it("accepts the wire payload", () => {
    expect(turnTimeDataSchema.parse({ at: 1, turnId: "t", outcome: "completed" })).toEqual({
      at: 1,
      turnId: "t",
      outcome: "completed",
    });
    expect(turnTimeDataSchema.safeParse({ at: 1, turnId: "t", outcome: "done" }).success).toBe(false);
  });
});
