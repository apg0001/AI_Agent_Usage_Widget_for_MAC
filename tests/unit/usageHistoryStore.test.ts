import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HISTORY_MAX_POINTS, UsageHistoryStore } from "../../src/main/usageHistoryStore";
import { ProviderUsage, UsageHistoryPoint } from "../../src/shared/types";

const temporaryDirectories: string[] = [];

function temporaryFile() {
  const directory = mkdtempSync(path.join(tmpdir(), "gigacharge-history-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "usage-history.json");
}

function usage(
  observedAt: string,
  percent: number,
  overrides: Partial<ProviderUsage> = {}
): ProviderUsage {
  return {
    provider: "claude",
    label: "Claude",
    used: percent,
    limit: 100,
    unit: "credits",
    percent,
    status: "ok",
    updatedAt: observedAt,
    dataUpdatedAt: observedAt,
    resetTrackingId: "account-a",
    source: "api",
    windows: [
      {
        id: "primary",
        label: "5시간 한도",
        percent,
        resetsAt: "2026-08-09T15:00:00.000Z",
        quality: "exact"
      }
    ],
    ...overrides
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("UsageHistoryStore", () => {
  it("5분 heartbeat 또는 사용률/초기화 시각 변화가 있을 때만 기록한다", () => {
    let now = Date.parse("2026-08-09T10:00:00.000Z");
    const store = new UsageHistoryStore(temporaryFile(), () => now);

    expect(store.record(usage(new Date(now).toISOString(), 10))).toHaveLength(1);
    now += 4 * 60_000;
    expect(store.record(usage(new Date(now).toISOString(), 10))).toHaveLength(0);
    now += 60_000;
    expect(store.record(usage(new Date(now).toISOString(), 10))).toHaveLength(1);
    now += 10_000;
    expect(store.record(usage(new Date(now).toISOString(), 11))).toHaveLength(1);
    now += 10_000;
    const resetChanged = usage(new Date(now).toISOString(), 11);
    resetChanged.windows![0].resetsAt = "2026-08-10T15:00:00.000Z";
    expect(store.record(resetChanged)).toHaveLength(1);

    expect(store.getProviderHistory("claude", "24h").points).toHaveLength(4);
  });

  it("stale, 오류, 로그아웃, unavailable 데이터는 기록하지 않는다", () => {
    const now = Date.parse("2026-08-09T10:00:00.000Z");
    const store = new UsageHistoryStore(temporaryFile(), () => now);
    const iso = new Date(now).toISOString();

    const unavailable = usage(iso, 0);
    unavailable.windows![0].available = false;

    expect(store.record(usage(iso, 10, { stale: true }))).toEqual([]);
    expect(store.record(usage(iso, 10, { status: "error" }))).toEqual([]);
    expect(store.record(usage(iso, 10, { status: "signed-out" }))).toEqual([]);
    expect(store.record(unavailable)).toEqual([]);
    expect(store.getAllPoints()).toEqual([]);
  });

  it("허용한 사용량 필드만 저장하고 인증정보와 메시지를 복제하지 않는다", () => {
    const now = Date.parse("2026-08-09T10:00:00.000Z");
    const filePath = temporaryFile();
    const store = new UsageHistoryStore(filePath, () => now);
    const value = usage(new Date(now).toISOString(), 25, {
      message: "top-secret-token"
    }) as ProviderUsage & { accessToken: string };
    value.accessToken = "top-secret-token";

    store.record(value);

    const raw = readFileSync(filePath, "utf8");
    expect(raw).not.toContain("top-secret-token");
    expect(raw).not.toContain("accessToken");
    expect(JSON.parse(raw).points[0]).toEqual({
      provider: "claude",
      windowId: "primary",
      windowLabel: "5시간 한도",
      percent: 25,
      observedAt: "2026-08-09T10:00:00.000Z",
      resetsAt: "2026-08-09T15:00:00.000Z",
      trackingId: "account-a",
      quality: "exact"
    });
    expect(readdirSync(path.dirname(filePath)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("손상된 파일을 빈 이력으로 복구하고 다음 기록을 정상 저장한다", () => {
    const now = Date.parse("2026-08-09T10:00:00.000Z");
    const filePath = temporaryFile();
    writeFileSync(filePath, "{broken json");

    const store = new UsageHistoryStore(filePath, () => now);
    expect(store.getAllPoints()).toEqual([]);
    expect(store.record(usage(new Date(now).toISOString(), 15))).toHaveLength(1);
    expect(JSON.parse(readFileSync(filePath, "utf8")).points).toHaveLength(1);
  });

  it("30일보다 오래된 점을 제거하고 안전 상한만큼의 최신 점을 유지한다", () => {
    const now = Date.parse("2026-08-09T10:00:00.000Z");
    const filePath = temporaryFile();
    const oldPoint: UsageHistoryPoint = {
      provider: "codex",
      windowId: "primary",
      windowLabel: "5시간 한도",
      percent: 1,
      observedAt: new Date(now - 31 * 24 * 60 * 60_000).toISOString(),
      trackingId: "default",
      quality: "exact"
    };
    const recentPoints = Array.from({ length: HISTORY_MAX_POINTS + 5 }, (_, index): UsageHistoryPoint => ({
      provider: "codex",
      windowId: "primary",
      windowLabel: "5시간 한도",
      percent: index % 101,
      observedAt: new Date(now - (HISTORY_MAX_POINTS + 4 - index) * 1_000).toISOString(),
      trackingId: "default",
      quality: "exact"
    }));
    writeFileSync(filePath, JSON.stringify({ version: 1, points: [oldPoint, ...recentPoints] }));

    const store = new UsageHistoryStore(filePath, () => now);
    const points = store.getAllPoints();

    expect(points).toHaveLength(HISTORY_MAX_POINTS);
    expect(points[0].observedAt).toBe(recentPoints[5].observedAt);
    expect(points.some((point) => point.observedAt === oldPoint.observedAt)).toBe(false);
  });

  it("24시간 이후 점을 다중 해상도로 압축하면서 30일 시작 구간과 극값을 보존한다", () => {
    const now = Date.parse("2026-08-09T10:00:00.000Z");
    const filePath = temporaryFile();
    const start = now - 30 * 24 * 60 * 60_000;
    const densePoints = Array.from({ length: 30 * 24 * 12 }, (_, index): UsageHistoryPoint => ({
      provider: "codex",
      windowId: "weekly",
      windowLabel: "주간 한도",
      percent: index % 3 === 0 ? 5 : index % 3 === 1 ? 95 : 50,
      observedAt: new Date(start + index * 5 * 60_000).toISOString(),
      resetsAt: "2026-08-10T10:00:00.000Z",
      trackingId: "account-a",
      quality: "exact"
    }));
    writeFileSync(filePath, JSON.stringify({ version: 1, points: densePoints }));

    const store = new UsageHistoryStore(filePath, () => now);
    const points = store.getProviderHistory("codex", "30d").points;

    expect(points.length).toBeLessThan(densePoints.length / 2);
    expect(Date.parse(points[0].observedAt)).toBeLessThanOrEqual(now - 29 * 24 * 60 * 60_000);
    expect(points.some((point) => point.percent === 5)).toBe(true);
    expect(points.some((point) => point.percent === 95)).toBe(true);
    expect(store.getProviderHistory("codex", "24h").points.length).toBeGreaterThan(200);
  });

  it("조회 범위와 제공자, 계정, window 필터를 적용한다", () => {
    let now = Date.parse("2026-08-09T10:00:00.000Z");
    const store = new UsageHistoryStore(temporaryFile(), () => now);
    store.record(usage(new Date(now).toISOString(), 10));

    now += 25 * 60 * 60_000;
    store.record(usage(new Date(now).toISOString(), 20));

    expect(store.getProviderHistory("claude", "24h").points.map((point) => point.percent)).toEqual([20]);
    expect(store.getProviderHistory("claude", "7d", { trackingId: "account-a", windowId: "primary" }).points).toHaveLength(2);
    expect(store.getProviderHistory("codex", "7d").points).toEqual([]);
  });
});
