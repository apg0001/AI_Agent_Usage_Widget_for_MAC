import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppSettings } from "../../src/shared/types";

const codexOnlySettings: AppSettings = {
  refreshIntervalMs: 10_000,
  menuBarDisplayMode: "icons",
  providers: {
    codex: { visible: true },
    claude: { visible: false },
    gemini: { visible: false }
  }
};

let fakeHome = "";
let previousLocalDetection: string | undefined;
let previousCodexHome: string | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-09T09:00:00.000Z"));
  fakeHome = mkdtempSync(path.join(tmpdir(), "quota-bar-codex-"));
  previousLocalDetection = process.env.AI_USAGE_WIDGET_DISABLE_LOCAL_DETECTION;
  previousCodexHome = process.env.CODEX_HOME;
  process.env.AI_USAGE_WIDGET_DISABLE_LOCAL_DETECTION = "0";
  delete process.env.CODEX_HOME;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.doUnmock("node:fs");
  vi.doUnmock("node:os");
  if (previousLocalDetection === undefined) {
    delete process.env.AI_USAGE_WIDGET_DISABLE_LOCAL_DETECTION;
  } else {
    process.env.AI_USAGE_WIDGET_DISABLE_LOCAL_DETECTION = previousLocalDetection;
  }
  if (previousCodexHome === undefined) {
    delete process.env.CODEX_HOME;
  } else {
    process.env.CODEX_HOME = previousCodexHome;
  }
  rmSync(fakeHome, { recursive: true, force: true });
});

describe("Codex 로컬 사용량 읽기", () => {
  it("큰 세션 파일은 끝부분만 읽고 60초 동안 디렉터리 스캔을 재사용한다", async () => {
    const sessionDirectory = path.join(fakeHome, ".codex", "sessions");
    mkdirSync(sessionDirectory, { recursive: true });
    const record = JSON.stringify({
      timestamp: new Date().toISOString(),
      payload: {
        rate_limits: {
          primary: { used_percent: 34, resets_in_seconds: 3_600, window_minutes: 300 },
          secondary: { used_percent: 12, resets_in_seconds: 86_400, window_minutes: 10_080 },
          plan_type: "test"
        }
      }
    });
    writeFileSync(
      path.join(sessionDirectory, "large-session.jsonl"),
      `${"ignored\n".repeat(300_000)}${record}\n`,
      "utf8"
    );

    let sessionDirectoryReads = 0;
    let jsonlWholeFileReads = 0;
    vi.doMock("node:os", async (importOriginal) => {
      const original = await importOriginal<typeof import("node:os")>();
      return { ...original, homedir: () => fakeHome };
    });
    vi.doMock("node:fs", async (importOriginal) => {
      const original = await importOriginal<typeof import("node:fs")>();
      return {
        ...original,
        readdirSync: (...args: unknown[]) => {
          if (String(args[0]).includes(path.join(".codex", "sessions"))) {
            sessionDirectoryReads += 1;
          }
          return Reflect.apply(original.readdirSync, original, args);
        },
        readFileSync: (...args: unknown[]) => {
          if (String(args[0]).endsWith(".jsonl")) {
            jsonlWholeFileReads += 1;
          }
          return Reflect.apply(original.readFileSync, original, args);
        }
      };
    });
    vi.stubGlobal("fetch", vi.fn());
    vi.resetModules();
    const { fetchUsageSnapshot } = await import("../../src/main/usageProviders");

    let [codex] = await fetchUsageSnapshot(codexOnlySettings);
    expect(codex.percent).toBe(34);
    expect(codex.source).toBe("local");

    vi.advanceTimersByTime(10_000);
    [codex] = await fetchUsageSnapshot(codexOnlySettings);

    expect(codex.percent).toBe(34);
    expect(sessionDirectoryReads).toBe(1);
    expect(jsonlWholeFileReads).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
