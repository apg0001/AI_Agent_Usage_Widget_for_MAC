import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({
  userDataPath: ""
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => electronMock.userDataPath)
  }
}));

import {
  defaultNotificationSettings,
  getSettings,
  normalizeNotificationSettings,
  toPublicSettings
} from "../../src/main/settingsStore";

let testDirectory = "";

beforeEach(() => {
  testDirectory = mkdtempSync(join(tmpdir(), "gigacharge-settings-"));
  electronMock.userDataPath = testDirectory;
});

afterEach(() => {
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("알림 설정 정규화", () => {
  it("잘못된 임계치를 제거하고 범위 밖 숫자를 보정한다", () => {
    const settings = normalizeNotificationSettings({
      providers: {
        codex: {
          enabled: false,
          thresholds: [-10, 0, 1.4, 90.6, 150, 90.6, Number.NaN, "50"],
          resetEnabled: false,
          projectedExhaustionEnabled: false
        },
        claude: { thresholds: [] },
        gemini: { thresholds: [Number.POSITIVE_INFINITY] }
      }
    });

    expect(settings.providers.codex).toEqual({
      enabled: false,
      thresholds: [1, 91, 100],
      resetEnabled: false,
      projectedExhaustionEnabled: false
    });
    expect(settings.providers.claude.thresholds).toEqual([]);
    expect(settings.providers.gemini.thresholds).toEqual([75, 90, 100]);
  });

  it("잘못된 시간과 cooldown은 기본값을 쓰고 유효한 값은 범위 내로 보정한다", () => {
    const malformed = normalizeNotificationSettings({
      cooldownMinutes: Number.NaN,
      quietHours: { enabled: "yes", start: "24:00", end: "07:60" }
    });
    const clampedLow = normalizeNotificationSettings({
      cooldownMinutes: 0,
      quietHours: { enabled: true, start: "23:45", end: "07:05" }
    });
    const clampedHigh = normalizeNotificationSettings({ cooldownMinutes: 99_999 });

    expect(malformed.cooldownMinutes).toBe(30);
    expect(malformed.quietHours).toEqual({ enabled: false, start: "22:00", end: "08:00" });
    expect(clampedLow.cooldownMinutes).toBe(1);
    expect(clampedLow.quietHours).toEqual({ enabled: true, start: "23:45", end: "07:05" });
    expect(clampedHigh.cooldownMinutes).toBe(1_440);
  });

  it("이전 버전의 settings 파일에 알림 기본값과 누락된 provider를 추가한다", () => {
    writeFileSync(join(testDirectory, "ai-usage-widget.json"), JSON.stringify({
      settings: {
        refreshIntervalMs: 5_000,
        menuBarDisplayMode: "iconsWithPercent",
        providers: {
          codex: { visible: false },
          claude: { visible: true }
        }
      }
    }));

    const migrated = getSettings();

    expect(migrated.refreshIntervalMs).toBe(10_000);
    expect(migrated.menuBarDisplayMode).toBe("iconsWithPercent");
    expect(migrated.notifications).toEqual(defaultNotificationSettings);
    expect(migrated.providers).toEqual({
      codex: { visible: false },
      claude: { visible: true },
      gemini: { visible: true }
    });
  });

  it("잘못된 provider 표시 값은 기본 boolean으로 복구한다", () => {
    writeFileSync(join(testDirectory, "ai-usage-widget.json"), JSON.stringify({
      settings: {
        providers: {
          codex: { visible: "false" },
          claude: { visible: null },
          gemini: { visible: 0 }
        }
      }
    }));

    const migrated = getSettings();

    expect(migrated.providers.codex.visible).toBe(true);
    expect(migrated.providers.claude.visible).toBe(true);
    expect(migrated.providers.gemini.visible).toBe(true);
  });

  it("renderer 공개 설정에는 인증 토큰을 포함하지 않는다", () => {
    const settings = getSettings();
    settings.providers.codex.auth = {
      type: "oauth",
      accessToken: "access-secret",
      refreshToken: "refresh-secret",
      accountLabel: "private@example.com"
    };

    const publicSettings = toPublicSettings(settings);
    const serialized = JSON.stringify(publicSettings);

    expect(publicSettings.providers.codex).toEqual({ visible: true, hasSavedAuth: true });
    expect(serialized).not.toContain("access-secret");
    expect(serialized).not.toContain("refresh-secret");
    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain('"auth"');
  });
});
