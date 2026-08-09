import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppSettings } from "../../src/shared/types";

const claudeOnlySettings: AppSettings = {
  refreshIntervalMs: 10_000,
  menuBarDisplayMode: "icons",
  providers: {
    codex: { visible: false },
    claude: { visible: true },
    gemini: { visible: false }
  }
};

let fakeHome = "";
let previousLocalDetection: string | undefined;
let previousClaudeConfigDirectory: string | undefined;

function writeClaudeCredential(
  accessToken: string,
  refreshToken: string | null = "refresh-account-a",
  refreshTokenExpiresAt?: number
) {
  const claudeDirectory = path.join(fakeHome, ".claude");
  mkdirSync(claudeDirectory, { recursive: true });
  writeFileSync(
    path.join(claudeDirectory, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken,
        ...(refreshToken ? { refreshToken } : {}),
        ...(refreshTokenExpiresAt === undefined ? {} : { refreshTokenExpiresAt })
      }
    }),
    "utf8"
  );
}

function usageResponse(percent: number) {
  return new globalThis.Response(
    JSON.stringify({
      five_hour: {
        utilization: percent,
        resets_at: "2026-08-10T03:00:00.000Z"
      },
      seven_day: {
        utilization: Math.max(0, percent - 5),
        resets_at: "2026-08-16T03:00:00.000Z"
      }
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function errorResponse(status: number, retryAfter?: string) {
  return new globalThis.Response(JSON.stringify({ error: { type: "test_error" } }), {
    status,
    headers: retryAfter ? { "Retry-After": retryAfter } : undefined
  });
}

async function loadUsageProviders() {
  vi.resetModules();
  vi.doMock("node:os", async (importOriginal) => {
    const original = await importOriginal<typeof import("node:os")>();
    return { ...original, homedir: () => fakeHome };
  });
  return import("../../src/main/usageProviders");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-09T09:00:00.000Z"));
  fakeHome = mkdtempSync(path.join(tmpdir(), "quota-bar-claude-"));
  previousLocalDetection = process.env.AI_USAGE_WIDGET_DISABLE_LOCAL_DETECTION;
  previousClaudeConfigDirectory = process.env.CLAUDE_CONFIG_DIR;
  process.env.AI_USAGE_WIDGET_DISABLE_LOCAL_DETECTION = "0";
  delete process.env.CLAUDE_CONFIG_DIR;
  writeClaudeCredential("token-a");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.doUnmock("node:os");
  if (previousLocalDetection === undefined) {
    delete process.env.AI_USAGE_WIDGET_DISABLE_LOCAL_DETECTION;
  } else {
    process.env.AI_USAGE_WIDGET_DISABLE_LOCAL_DETECTION = previousLocalDetection;
  }
  if (previousClaudeConfigDirectory === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR;
  } else {
    process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDirectory;
  }
  rmSync(fakeHome, { recursive: true, force: true });
});

describe("Claude 사용량 폴링", () => {
  it("10초 스냅샷 갱신 중 API는 최소 60초에 한 번만 호출한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(usageResponse(25)).mockResolvedValueOnce(usageResponse(31));
    vi.stubGlobal("fetch", fetchMock);
    const { fetchUsageSnapshot } = await loadUsageProviders();

    let [claude] = await fetchUsageSnapshot(claudeOnlySettings);
    expect(claude.percent).toBe(25);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10_000);
    [claude] = await fetchUsageSnapshot(claudeOnlySettings);
    expect(claude.percent).toBe(25);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(49_999);
    await fetchUsageSnapshot(claudeOnlySettings);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    [claude] = await fetchUsageSnapshot(claudeOnlySettings);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(claude.percent).toBe(31);
  });

  it("429 응답의 Retry-After 동안 세션 연결 상태를 유지하고 재호출을 미룬다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(errorResponse(429, "120")).mockResolvedValueOnce(usageResponse(20));
    vi.stubGlobal("fetch", fetchMock);
    const { fetchUsageSnapshot } = await loadUsageProviders();

    let [claude] = await fetchUsageSnapshot(claudeOnlySettings);
    expect(claude.status).toBe("error");
    expect(claude.connectionStatus).toBe("connected");
    expect(claude.message).toContain("사용량 조회가 제한");

    vi.advanceTimersByTime(60_000);
    [claude] = await fetchUsageSnapshot(claudeOnlySettings);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(claude.status).not.toBe("signed-out");

    vi.advanceTimersByTime(60_000);
    [claude] = await fetchUsageSnapshot(claudeOnlySettings);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(claude.percent).toBe(20);
  });

  it("성공 뒤 429가 발생하면 마지막 사용량을 stale 상태로 유지한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(usageResponse(37)).mockResolvedValueOnce(errorResponse(429, "120"));
    vi.stubGlobal("fetch", fetchMock);
    const { fetchUsageSnapshot } = await loadUsageProviders();

    await fetchUsageSnapshot(claudeOnlySettings);
    vi.advanceTimersByTime(60_000);
    const [claude] = await fetchUsageSnapshot(claudeOnlySettings);

    expect(claude.percent).toBe(37);
    expect(claude.stale).toBe(true);
    expect(claude.connectionStatus).toBe("connected");
    expect(claude.message).toContain("사용량 조회가 제한");
  });

  it("401은 실제 로그인 만료로 구분한다", async () => {
    writeClaudeCredential("token-a", null);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse(401)));
    const { fetchUsageSnapshot } = await loadUsageProviders();

    const [claude] = await fetchUsageSnapshot(claudeOnlySettings);

    expect(claude.status).toBe("signed-out");
    expect(claude.connectionStatus).toBe("signed-out");
    expect(claude.message).toContain("로그인 세션이 만료");
  });

  it("refresh credential이 남은 401은 로그아웃으로 오인하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse(401)));
    const { fetchUsageSnapshot } = await loadUsageProviders();

    const [claude] = await fetchUsageSnapshot(claudeOnlySettings);

    expect(claude.status).toBe("error");
    expect(claude.connectionStatus).toBe("connected");
    expect(claude.message).toContain("토큰 갱신을 기다리는 중");
  });

  it("만료된 refresh credential은 401에서 실제 로그인 만료로 표시한다", async () => {
    writeClaudeCredential("token-a", "expired-refresh", Date.now() - 1_000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse(401)));
    const { fetchUsageSnapshot } = await loadUsageProviders();

    const [claude] = await fetchUsageSnapshot(claudeOnlySettings);

    expect(claude.status).toBe("signed-out");
    expect(claude.connectionStatus).toBe("signed-out");
  });

  it("Claude Code가 토큰을 갱신하면 기존 대기 시간을 즉시 해제한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(errorResponse(429, "600")).mockResolvedValueOnce(usageResponse(18));
    vi.stubGlobal("fetch", fetchMock);
    const { fetchUsageSnapshot } = await loadUsageProviders();

    await fetchUsageSnapshot(claudeOnlySettings);
    vi.advanceTimersByTime(10_000);
    writeClaudeCredential("token-b");
    const [claude] = await fetchUsageSnapshot(claudeOnlySettings);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(claude.percent).toBe(18);
  });

  it("같은 계정의 토큰 갱신 직후 429가 나도 마지막 성공 사용량을 보존한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(usageResponse(44)).mockResolvedValueOnce(errorResponse(429, "120"));
    vi.stubGlobal("fetch", fetchMock);
    const { fetchUsageSnapshot } = await loadUsageProviders();

    await fetchUsageSnapshot(claudeOnlySettings);
    vi.advanceTimersByTime(10_000);
    writeClaudeCredential("token-b");
    const [claude] = await fetchUsageSnapshot(claudeOnlySettings);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(claude.percent).toBe(44);
    expect(claude.stale).toBe(true);
    expect(claude.connectionStatus).toBe("connected");
  });

  it("Retry-After의 초, HTTP 날짜, 잘못된 값을 파싱한다", async () => {
    const { parseRetryAfterMs } = await loadUsageProviders();
    const now = Date.now();

    expect(parseRetryAfterMs("56", now)).toBe(56_000);
    expect(parseRetryAfterMs(new Date(now + 90_000).toUTCString(), now)).toBe(90_000);
    expect(parseRetryAfterMs("invalid", now)).toBeUndefined();
  });
});
