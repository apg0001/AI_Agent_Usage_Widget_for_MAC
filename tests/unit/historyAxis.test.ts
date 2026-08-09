import { describe, expect, it } from "vitest";
import { buildHistoryAxisTicks, normalizeHistoryPoints } from "../../src/renderer/src/historyAxis";
import type { UsageHistoryPoint } from "../../src/shared/types";

function point(observedAt: string, percent = 10): UsageHistoryPoint {
  return {
    provider: "codex",
    windowId: "primary",
    windowLabel: "5시간 한도",
    percent,
    observedAt,
    trackingId: "account",
    quality: "exact"
  };
}

describe("히스토리 시간 축", () => {
  it("24시간 범위의 같은 날짜에는 시작·중앙·끝 시각을 표시한다", () => {
    const ticks = buildHistoryAxisTicks(
      [point("2026-08-09T00:00:00.000Z"), point("2026-08-09T08:00:00.000Z")],
      "24h",
      { timeZone: "Asia/Seoul" }
    );

    expect(ticks.map((tick) => tick.label)).toEqual(["09:00", "13:00", "17:00"]);
    expect(ticks.map((tick) => tick.ratio)).toEqual([0, 0.5, 1]);
    expect(ticks.map((tick) => tick.position)).toEqual(["start", "middle", "end"]);
  });

  it("24시간 범위가 자정을 지나면 날짜와 시각을 함께 표시한다", () => {
    const ticks = buildHistoryAxisTicks(
      [point("2026-08-09T14:30:00.000Z"), point("2026-08-09T16:30:00.000Z")],
      "24h",
      { timeZone: "Asia/Seoul" }
    );

    expect(ticks.map((tick) => tick.label)).toEqual([
      "8/9 23:30",
      "8/10 00:30",
      "8/10 01:30"
    ]);
  });

  it("7일 범위에는 실제 관측 구간의 날짜를 표시한다", () => {
    const ticks = buildHistoryAxisTicks(
      [point("2026-08-01T00:00:00.000Z"), point("2026-08-08T00:00:00.000Z")],
      "7d",
      { timeZone: "UTC" }
    );

    expect(ticks.map((tick) => tick.label)).toEqual(["8/1", "8/4", "8/8"]);
  });

  it("긴 범위를 선택해도 실제 기록이 같은 날짜면 시각을 보강한다", () => {
    const ticks = buildHistoryAxisTicks(
      [point("2026-08-09T09:00:00.000Z"), point("2026-08-09T17:00:00.000Z")],
      "30d",
      { timeZone: "UTC" }
    );

    expect(ticks.map((tick) => tick.label)).toEqual([
      "8/9 09:00",
      "8/9 13:00",
      "8/9 17:00"
    ]);
  });

  it("연도를 넘는 30일 구간에는 연도를 포함한다", () => {
    const ticks = buildHistoryAxisTicks(
      [point("2025-12-20T00:00:00.000Z"), point("2026-01-10T00:00:00.000Z")],
      "30d",
      { timeZone: "UTC" }
    );

    expect(ticks.map((tick) => tick.label)).toEqual([
      "2025/12/20",
      "2025/12/30",
      "2026/1/10"
    ]);
  });

  it("분 단위 라벨이 겹치면 초 단위까지 자동으로 보강한다", () => {
    const ticks = buildHistoryAxisTicks(
      [point("2026-08-09T09:00:00.000Z"), point("2026-08-09T09:00:20.000Z")],
      "24h",
      { timeZone: "UTC" }
    );

    expect(ticks.map((tick) => tick.label)).toEqual([
      "8/9 09:00:00",
      "8/9 09:00:10",
      "8/9 09:00:20"
    ]);
  });

  it("서머타임 종료로 현지 시각이 반복되면 짧은 UTC 오프셋으로 구분한다", () => {
    const ticks = buildHistoryAxisTicks(
      [point("2026-10-25T00:30:00.000Z"), point("2026-10-25T01:30:00.000Z")],
      "24h",
      { locale: "ko-KR", timeZone: "Europe/Berlin" }
    );

    expect(ticks.map((tick) => tick.label)).toEqual([
      "02:30:00.000 +2",
      "02:00:00.000 +1",
      "02:30:00.000 +1"
    ]);
    expect(new Set(ticks.map((tick) => tick.label)).size).toBe(3);
    expect(ticks[0].fullLabel).toContain("GMT+2");
    expect(ticks[2].fullLabel).toContain("GMT+1");
  });

  it("서머타임 시작 때도 절대 경과 시간의 중앙을 사용한다", () => {
    const ticks = buildHistoryAxisTicks(
      [point("2026-03-29T00:30:00.000Z"), point("2026-03-29T02:30:00.000Z")],
      "24h",
      { timeZone: "Europe/Berlin" }
    );

    expect(ticks.map((tick) => tick.label)).toEqual(["01:30", "03:30", "04:30"]);
    expect(ticks[1].timestamp).toBe("2026-03-29T01:30:00.000Z");
  });

  it("잘못된 값은 제외하고 시각을 정렬하며 같은 시각은 하나만 유지한다", () => {
    const normalized = normalizeHistoryPoints([
      point("2026-08-09T12:00:00.000Z", 20),
      point("invalid", 30),
      point("2026-08-09T10:00:00.000Z", 10),
      point("2026-08-09T12:00:00.000Z", 25),
      point("2026-08-09T11:00:00.000Z", 101)
    ]);

    expect(normalized.map((item) => [item.observedAt, item.percent])).toEqual([
      ["2026-08-09T10:00:00.000Z", 10],
      ["2026-08-09T12:00:00.000Z", 25]
    ]);
    expect(buildHistoryAxisTicks([point("invalid")], "24h", { timeZone: "UTC" })).toEqual([]);
  });

  it("유효 기록이 하나뿐이면 중앙 라벨 하나만 만든다", () => {
    const ticks = buildHistoryAxisTicks([point("2026-08-09T09:00:00.000Z")], "24h", {
      timeZone: "UTC"
    });

    expect(ticks).toHaveLength(1);
    expect(ticks[0]).toMatchObject({ label: "09:00", ratio: 0.5, position: "middle" });
  });
});
