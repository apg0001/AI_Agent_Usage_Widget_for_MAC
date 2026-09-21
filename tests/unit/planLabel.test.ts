import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatPlanLabel } from "../../src/main/usageProviders";
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

const geminiOnlySettings: AppSettings = {
  ...claudeOnlySettings,
  providers: {
    codex: { visible: false },
    claude: { visible: false },
    gemini: { visible: true }
  }
};

const codexOnlySettings: AppSettings = {
  ...claudeOnlySettings,
  providers: {
    codex: { visible: true },
    claude: { visible: false },
    gemini: { visible: false }
  }
};

let fakeHome = "";
let previousLocalDetection: string | undefined;
let previousClaudeConfigDirectory: string | undefined;
let previousCodexHome: string | undefined;

function writeGeminiCliCredentials(expiryDate: number) {
  const geminiDirectory = path.join(fakeHome, ".gemini");
  mkdirSync(geminiDirectory, { recursive: true });
  writeFileSync(
    path.join(geminiDirectory, "oauth_creds.json"),
    JSON.stringify({ access_token: "gemini-access-token", expiry_date: expiryDate }),
    "utf8"
  );
}

async function loadUsageProviders(antigravityKeyringToken: string | null = null) {
  vi.resetModules();
  vi.doMock("node:os", async (importOriginal) => {
    const original = await importOriginal<typeof import("node:os")>();
    return { ...original, homedir: () => fakeHome };
  });
  vi.doMock("../../src/main/platform/index", async (importOriginal) => {
    const original = await importOriginal<typeof import("../../src/main/platform/index")>();
    return {
      ...original,
      platformAdapter: {
        ...original.platformAdapter,
        readClaudeKeychainCredential: () => null,
        readAntigravityKeyringToken: () => antigravityKeyringToken
      }
    };
  });
  return import("../../src/main/usageProviders");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-09T09:00:00.000Z"));
  fakeHome = mkdtempSync(path.join(tmpdir(), "gigacharge-plan-"));
  previousLocalDetection = process.env.AI_USAGE_WIDGET_DISABLE_LOCAL_DETECTION;
  previousClaudeConfigDirectory = process.env.CLAUDE_CONFIG_DIR;
  previousCodexHome = process.env.CODEX_HOME;
  process.env.AI_USAGE_WIDGET_DISABLE_LOCAL_DETECTION = "0";
  delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env.CODEX_HOME;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.doUnmock("node:os");
  vi.doUnmock("../../src/main/platform/index");
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
  if (previousCodexHome === undefined) {
    delete process.env.CODEX_HOME;
  } else {
    process.env.CODEX_HOME = previousCodexHome;
  }
  rmSync(fakeHome, { recursive: true, force: true });
});

describe("플랜 이름 정규화", () => {
  it("제공자 슬러그를 짧은 배지 문구로 바꾼다", () => {
    expect(formatPlanLabel("plus")).toBe("Plus");
    expect(formatPlanLabel("max_5x")).toBe("Max 5X");
    expect(formatPlanLabel("chatgpt_pro")).toBe("Pro");
    expect(formatPlanLabel("Team Plan")).toBe("Team");
  });

  it("알아볼 수 없는 값은 배지로 만들지 않는다", () => {
    expect(formatPlanLabel(undefined)).toBeUndefined();
    expect(formatPlanLabel("   ")).toBeUndefined();
    expect(formatPlanLabel("a b c d")).toBeUndefined();
    expect(formatPlanLabel("supercalifragilistic_subscription_name")).toBeUndefined();
  });
});

describe("제공자 플랜 표시", () => {
  it("Claude 로컬 자격 증명의 구독 종류를 플랜으로 노출한다", async () => {
    const claudeDirectory = path.join(fakeHome, ".claude");
    mkdirSync(claudeDirectory, { recursive: true });
    writeFileSync(
      path.join(claudeDirectory, ".credentials.json"),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "token-a",
          refreshToken: "refresh-a",
          subscriptionType: "max"
        }
      }),
      "utf8"
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new globalThis.Response(
          JSON.stringify({
            five_hour: { utilization: 20, resets_at: "2026-08-09T12:00:00.000Z" },
            seven_day: { utilization: 10, resets_at: "2026-08-16T03:00:00.000Z" }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const { fetchUsageSnapshot } = await loadUsageProviders();

    const [claude] = await fetchUsageSnapshot(claudeOnlySettings);
    expect(claude.planLabel).toBe("Max");
  });

  it("Codex 로컬 세션의 plan_type을 플랜으로 노출한다", async () => {
    const sessionDirectory = path.join(fakeHome, ".codex", "sessions");
    mkdirSync(sessionDirectory, { recursive: true });
    writeFileSync(
      path.join(sessionDirectory, "session.jsonl"),
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        payload: {
          rate_limits: {
            primary: { used_percent: 34, resets_in_seconds: 3_600, window_minutes: 300 },
            plan_type: "plus"
          }
        }
      })}\n`,
      "utf8"
    );
    vi.stubGlobal("fetch", vi.fn());
    const { fetchUsageSnapshot } = await loadUsageProviders();

    const [codex] = await fetchUsageSnapshot(codexOnlySettings);
    expect(codex.planLabel).toBe("Plus");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Gemini는 Code Assist 티어를 플랜으로 노출하고 캐시에 남긴다", async () => {
    writeGeminiCliCredentials(Date.now() + 30 * 60_000);
    const cacheDirectory = path.join(fakeHome, "userData");
    const fetchMock = vi.fn().mockResolvedValue(
      new globalThis.Response(JSON.stringify({ currentTier: { id: "standard-tier", name: "Standard" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchUsageSnapshot } = await loadUsageProviders();
    const { configurePlanCache, readCachedPlanLabel } = await import("../../src/main/planCacheStore");
    configurePlanCache(cacheDirectory);

    const [gemini] = await fetchUsageSnapshot(geminiOnlySettings);

    expect(gemini.planLabel).toBe("Standard");
    expect(readCachedPlanLabel("gemini")).toBe("Standard");
    expect(fetchMock.mock.calls[0][0]).toBe("https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist");
    configurePlanCache(null);
  });

  it("Gemini 토큰이 만료됐으면 API를 호출하지 않고 캐시된 플랜을 쓴다", async () => {
    writeGeminiCliCredentials(Date.now() - 60_000);
    const cacheDirectory = path.join(fakeHome, "userData");
    mkdirSync(cacheDirectory, { recursive: true });
    writeFileSync(
      path.join(cacheDirectory, "plan-cache.json"),
      JSON.stringify({ gemini: { label: "Free", observedAt: new Date().toISOString() } }),
      "utf8"
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { fetchUsageSnapshot } = await loadUsageProviders();
    const { configurePlanCache } = await import("../../src/main/planCacheStore");
    configurePlanCache(cacheDirectory);

    const [gemini] = await fetchUsageSnapshot(geminiOnlySettings);

    expect(gemini.planLabel).toBe("Free");
    expect(fetchMock).not.toHaveBeenCalled();
    configurePlanCache(null);
  });

  it("Antigravity 설정만 있어도 Gemini 세션으로 보고 키링 토큰으로 티어를 읽는다", async () => {
    mkdirSync(path.join(fakeHome, ".gemini", "antigravity-cli"), { recursive: true });
    const fetchMock = vi.fn().mockResolvedValue(
      new globalThis.Response(JSON.stringify({ currentTier: { id: "free-tier" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchUsageSnapshot } = await loadUsageProviders("ya29.antigravity-token");

    const [gemini] = await fetchUsageSnapshot(geminiOnlySettings);

    expect(gemini.connectionStatus).toBe("connected");
    expect(gemini.planLabel).toBe("Free");
    expect(gemini.windows?.[0]?.message).toBe("Antigravity CLI 세션 감지");
    expect(fetchMock.mock.calls[0][1]?.headers?.Authorization).toBe("Bearer ya29.antigravity-token");
  });

  it("Antigravity 설정이 없으면 키링을 건드리지 않는다", async () => {
    const keyringReader = vi.fn().mockReturnValue("ya29.should-not-be-used");
    vi.resetModules();
    vi.doMock("node:os", async (importOriginal) => {
      const original = await importOriginal<typeof import("node:os")>();
      return { ...original, homedir: () => fakeHome };
    });
    vi.doMock("../../src/main/platform/index", async (importOriginal) => {
      const original = await importOriginal<typeof import("../../src/main/platform/index")>();
      return {
        ...original,
        platformAdapter: {
          ...original.platformAdapter,
          readClaudeKeychainCredential: () => null,
          readAntigravityKeyringToken: keyringReader
        }
      };
    });
    vi.stubGlobal("fetch", vi.fn());
    const { fetchUsageSnapshot } = await import("../../src/main/usageProviders");

    await fetchUsageSnapshot(geminiOnlySettings);

    expect(keyringReader).not.toHaveBeenCalled();
  });

  it("Gemini CLI가 지원 종료 응답을 받으면 Antigravity 이전 안내를 표시한다", async () => {
    writeGeminiCliCredentials(Date.now() + 30 * 60_000);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new globalThis.Response(
          JSON.stringify({
            allowedTiers: [{ id: "standard-tier", name: "Gemini Code Assist" }],
            ineligibleTiers: [{ reasonCode: "UNSUPPORTED_CLIENT", tierId: "free-tier" }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const { fetchUsageSnapshot } = await loadUsageProviders();

    const [gemini] = await fetchUsageSnapshot(geminiOnlySettings);

    expect(gemini.planLabel).toBeUndefined();
    expect(gemini.message).toBe("Gemini CLI 지원 종료 — Antigravity로 이전 필요");
    expect(gemini.windows?.[0]?.message).toBe("Gemini CLI 지원 종료 — Antigravity로 이전 필요");
  });

  it("로그아웃 상태에서는 플랜을 표시하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { fetchUsageSnapshot } = await loadUsageProviders();

    const [claude] = await fetchUsageSnapshot(claudeOnlySettings);
    expect(claude.connectionStatus).toBe("signed-out");
    expect(claude.planLabel).toBeUndefined();
  });
});
