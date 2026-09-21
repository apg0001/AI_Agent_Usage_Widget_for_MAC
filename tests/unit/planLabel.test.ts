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

  it("로그아웃 상태에서는 플랜을 표시하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { fetchUsageSnapshot } = await loadUsageProviders();

    const [claude] = await fetchUsageSnapshot(claudeOnlySettings);
    expect(claude.connectionStatus).toBe("signed-out");
    expect(claude.planLabel).toBeUndefined();
  });
});
