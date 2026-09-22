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
  fakeHome = mkdtempSync(path.join(tmpdir(), "gigacharge-codex-"));
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

  it("gpt-reserve 같은 보조 한도 레코드는 건너뛰고 기본 codex 한도를 읽는다", async () => {
    const sessionDirectory = path.join(fakeHome, ".codex", "sessions");
    mkdirSync(sessionDirectory, { recursive: true });
    const now = new Date().toISOString();
    const lines = [
      // 기본 한도가 먼저 기록되고
      {
        timestamp: now,
        payload: {
          rate_limits: {
            limit_id: "codex",
            primary: { used_percent: 100, resets_in_seconds: 2_145, window_minutes: 300 },
            secondary: { used_percent: 36, resets_in_seconds: 501_030, window_minutes: 10_080 },
            plan_type: "plus"
          }
        }
      },
      // 창이 비어 있는 보조 한도와
      {
        timestamp: now,
        payload: {
          rate_limits: { limit_id: "premium", primary: null, secondary: null, plan_type: "plus" }
        }
      },
      // 7일짜리 gpt-reserve 레코드가 더 최신으로 뒤따라온다.
      {
        timestamp: now,
        payload: {
          rate_limits: {
            limit_id: "base_model_inference",
            limit_name: "gpt-reserve",
            primary: { used_percent: 0, resets_in_seconds: 604_800, window_minutes: 10_080 },
            secondary: null,
            plan_type: "plus"
          }
        }
      }
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n");
    writeFileSync(path.join(sessionDirectory, "session.jsonl"), `${lines}\n`, "utf8");

    vi.doMock("node:os", async (importOriginal) => {
      const original = await importOriginal<typeof import("node:os")>();
      return { ...original, homedir: () => fakeHome };
    });
    vi.stubGlobal("fetch", vi.fn());
    vi.resetModules();
    const { fetchUsageSnapshot } = await import("../../src/main/usageProviders");

    const [codex] = await fetchUsageSnapshot(codexOnlySettings);

    expect(codex.source).toBe("local");
    expect(codex.percent).toBe(100);
    expect(codex.windows?.map((window) => [window.id, window.percent, window.windowDurationMinutes])).toEqual([
      ["primary", 100, 300],
      ["weekly", 36, 10_080]
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
