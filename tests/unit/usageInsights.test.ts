import { describe, expect, it } from "vitest";
import {
  calculateUsagePace,
  enrichProviderUsageWithInsights,
  enrichUsageWithInsights
} from "../../src/main/usageInsights";
import { ProviderUsage, UsageHistoryPoint, UsageLimitWindow } from "../../src/shared/types";

const resetAt = "2026-08-09T15:00:00.000Z";

function window(percent = 60, overrides: Partial<UsageLimitWindow> = {}): UsageLimitWindow {
  return {
    id: "primary",
    label: "5시간 한도",
    percent,
    resetsAt: resetAt,
    quality: "exact",
    ...overrides
  };
}

function usage(currentWindow = window(), overrides: Partial<ProviderUsage> = {}): ProviderUsage {
  return {
    provider: "claude",
    label: "Claude",
    used: currentWindow.percent,
    limit: 100,
    unit: "credits",
    percent: currentWindow.percent,
    status: "ok",
    updatedAt: "2026-08-09T12:00:00.000Z",
    resetTrackingId: "account-a",
    source: "api",
    windows: [currentWindow],
    ...overrides
  };
}

function point(
  observedAt: string,
  percent: number,
  overrides: Partial<UsageHistoryPoint> = {}
): UsageHistoryPoint {
  return {
    provider: "claude",
    windowId: "primary",
    windowLabel: "5시간 한도",
    percent,
    observedAt,
    resetsAt: resetAt,
    trackingId: "account-a",
    quality: "exact",
    ...overrides
  };
}

describe("usage insights", () => {
  it("최소 두 샘플과 5분 구간 전에는 insufficient를 반환한다", () => {
    const current = usage();
    const single = calculateUsagePace(current, current.windows![0], [point("2026-08-09T11:59:00.000Z", 59)], Date.parse("2026-08-09T12:00:00.000Z"));
    const tooShort = calculateUsagePace(
      current,
      current.windows![0],
      [point("2026-08-09T11:57:00.000Z", 59), point("2026-08-09T12:00:00.000Z", 60)],
      Date.parse("2026-08-09T12:00:00.000Z")
    );

    expect(single).toMatchObject({ confidence: "insufficient", sampleCount: 1, sampleSpanMinutes: 0 });
    expect(tooShort).toMatchObject({ confidence: "insufficient", sampleCount: 2, sampleSpanMinutes: 3 });
    expect(tooShort?.burnRatePercentPerHour).toBeUndefined();
  });

  it("소진 속도, 초기화 시 예상 사용률, 초기화 전 100% 도달 시각을 계산한다", () => {
    const current = usage(window(60));
    const history = [
      point("2026-08-09T10:00:00.000Z", 20),
      point("2026-08-09T10:40:00.000Z", 30),
      point("2026-08-09T11:20:00.000Z", 45),
      point("2026-08-09T12:00:00.000Z", 60)
    ];

    const pace = calculateUsagePace(
      current,
      current.windows![0],
      history,
      Date.parse("2026-08-09T12:00:00.000Z")
    );

    expect(pace?.confidence).toBe("good");
    expect(pace?.burnRatePercentPerHour).toBeCloseTo(20.25, 2);
    expect(pace?.projectedPercentAtReset).toBe(100);
    expect(pace?.estimatedExhaustedAt).toBe("2026-08-09T13:58:31.111Z");
  });

  it("예상 소진이 초기화 뒤라면 ETA를 노출하지 않는다", () => {
    const current = usage(window(30));
    const pace = calculateUsagePace(
      current,
      current.windows![0],
      [point("2026-08-09T10:00:00.000Z", 20), point("2026-08-09T12:00:00.000Z", 30)],
      Date.parse("2026-08-09T12:00:00.000Z")
    );

    expect(pace?.burnRatePercentPerHour).toBe(5);
    expect(pace?.projectedPercentAtReset).toBe(45);
    expect(pace?.estimatedExhaustedAt).toBeUndefined();
  });

  it("다른 제공자, 계정, window, reset epoch의 점을 섞지 않는다", () => {
    const current = usage(window(40));
    const matching = [
      point("2026-08-09T10:00:00.000Z", 20),
      point("2026-08-09T12:00:00.000Z", 40)
    ];
    const unrelated = [
      point("2026-08-09T11:00:00.000Z", 90, { provider: "codex" }),
      point("2026-08-09T11:00:00.000Z", 90, { trackingId: "account-b" }),
      point("2026-08-09T11:00:00.000Z", 90, { windowId: "weekly" }),
      point("2026-08-09T11:00:00.000Z", 90, { resetsAt: "2026-08-10T15:00:00.000Z" })
    ];

    const pace = calculateUsagePace(
      current,
      current.windows![0],
      [...matching, ...unrelated],
      Date.parse("2026-08-09T12:00:00.000Z")
    );

    expect(pace).toMatchObject({ sampleCount: 2, burnRatePercentPerHour: 10 });
  });

  it("estimated 점이 포함되면 충분한 기간이어도 confidence를 good으로 올리지 않는다", () => {
    const currentWindow = window(40, { quality: "estimated" });
    const current = usage(currentWindow, { source: "token" });
    const history = [
      point("2026-08-09T10:00:00.000Z", 10, { quality: "estimated" }),
      point("2026-08-09T10:40:00.000Z", 20, { quality: "estimated" }),
      point("2026-08-09T11:20:00.000Z", 30, { quality: "estimated" }),
      point("2026-08-09T12:00:00.000Z", 40, { quality: "estimated" })
    ];

    expect(
      calculateUsagePace(current, currentWindow, history, Date.parse("2026-08-09T12:00:00.000Z"))?.confidence
    ).toBe("low");
  });

  it("stale/error/unavailable 현재 값에는 pace를 붙이지 않는다", () => {
    const history = [point("2026-08-09T10:00:00.000Z", 20), point("2026-08-09T12:00:00.000Z", 40)];
    const now = Date.parse("2026-08-09T12:00:00.000Z");

    expect(calculateUsagePace(usage(window(40), { stale: true }), window(40), history, now)).toBeUndefined();
    expect(calculateUsagePace(usage(window(40), { status: "error" }), window(40), history, now)).toBeUndefined();
    expect(calculateUsagePace(usage(window(0, { available: false })), window(0, { available: false }), history, now)).toBeUndefined();
  });

  it("각 window를 독립적으로 enrich하고 입력 객체를 변경하지 않는다", () => {
    const primary = window(40);
    const weekly = window(20, { id: "weekly", label: "주간 한도", resetsAt: "2026-08-16T12:00:00.000Z" });
    const original = usage(primary, { windows: [primary, weekly] });
    const history = [
      point("2026-08-09T10:00:00.000Z", 20),
      point("2026-08-09T12:00:00.000Z", 40),
      point("2026-08-09T10:00:00.000Z", 10, {
        windowId: "weekly",
        windowLabel: "주간 한도",
        resetsAt: "2026-08-16T12:00:00.000Z"
      }),
      point("2026-08-09T12:00:00.000Z", 20, {
        windowId: "weekly",
        windowLabel: "주간 한도",
        resetsAt: "2026-08-16T12:00:00.000Z"
      })
    ];

    const enriched = enrichProviderUsageWithInsights(original, history, Date.parse("2026-08-09T12:00:00.000Z"));
    expect(enriched.windows?.[0].pace?.burnRatePercentPerHour).toBe(10);
    expect(enriched.windows?.[1].pace?.burnRatePercentPerHour).toBe(5);
    expect(original.windows?.[0].pace).toBeUndefined();
    expect(enrichUsageWithInsights([original], history, Date.parse("2026-08-09T12:00:00.000Z"))).toHaveLength(1);
  });
});
