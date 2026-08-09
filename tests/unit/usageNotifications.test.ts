import { describe, expect, it } from "vitest";
import { isWithinQuietHours, UsageNotificationDetector } from "../../src/main/usageNotifications";
import type {
  NotificationSettings,
  ProviderNotificationSettings,
  ProviderUsage,
  QuietHoursSettings,
  UsageLimitWindow
} from "../../src/shared/types";

const RESET_AT = "2026-08-09T14:00:00.000Z";
const START = Date.parse("2026-08-09T10:00:00.000Z");

function at(minutes: number) {
  return new Date(START + minutes * 60_000);
}

type SettingsOptions = {
  enabled?: boolean;
  cooldownMinutes?: number;
  quietHours?: QuietHoursSettings;
  claude?: Partial<ProviderNotificationSettings>;
};

function notificationSettings(options: SettingsOptions = {}): NotificationSettings {
  const providerDefaults: ProviderNotificationSettings = {
    enabled: true,
    thresholds: [75, 90, 100],
    resetEnabled: true,
    projectedExhaustionEnabled: true
  };
  return {
    enabled: options.enabled ?? true,
    cooldownMinutes: options.cooldownMinutes ?? 30,
    quietHours: options.quietHours ?? { enabled: false, start: "22:00", end: "08:00" },
    providers: {
      codex: { ...providerDefaults },
      claude: { ...providerDefaults, ...options.claude },
      gemini: { ...providerDefaults }
    }
  };
}

type UsageOptions = {
  status?: ProviderUsage["status"];
  stale?: boolean;
  connectionStatus?: ProviderUsage["connectionStatus"];
  resetTrackingId?: string;
  window?: Partial<UsageLimitWindow>;
  windows?: UsageLimitWindow[];
};

function usage(percent: number, options: UsageOptions = {}): ProviderUsage {
  const status = options.status ?? "ok";
  const window: UsageLimitWindow = {
    id: "primary",
    label: "5시간 한도",
    percent,
    available: true,
    quality: "exact",
    resetsAt: RESET_AT,
    resetRemaining: "4시간",
    ...options.window
  };
  return {
    provider: "claude",
    label: "Claude",
    used: percent,
    limit: 100,
    unit: "credits",
    percent,
    status,
    stale: options.stale,
    connectionStatus: options.connectionStatus ?? (status === "signed-out" ? "signed-out" : "connected"),
    updatedAt: at(0).toISOString(),
    resetTrackingId: options.resetTrackingId ?? "account-a",
    windows: options.windows ?? [window]
  };
}

function projectedWindow(percent: number, overrides: Partial<UsageLimitWindow> = {}): Partial<UsageLimitWindow> {
  return {
    percent,
    pace: {
      confidence: "good",
      sampleCount: 4,
      sampleSpanMinutes: 35,
      burnRatePercentPerHour: 20,
      projectedPercentAtReset: 120,
      estimatedExhaustedAt: "2026-08-09T12:00:00.000Z"
    },
    ...overrides
  };
}

describe("UsageNotificationDetector", () => {
  it("does not notify from the first observation", () => {
    const detector = new UsageNotificationDetector();

    expect(detector.detect([usage(95, { window: projectedWindow(95) })], notificationSettings(), at(0))).toEqual([]);
  });

  it("returns only the highest threshold crossed in one sample", () => {
    const detector = new UsageNotificationDetector();
    detector.detect([usage(70)], notificationSettings(), at(0));

    const events = detector.detect([usage(96)], notificationSettings(), at(1));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "threshold",
      provider: "claude",
      resetTrackingId: "account-a",
      windowId: "primary",
      threshold: 90,
      percent: 96,
      resetEpoch: Date.parse(RESET_AT),
      key: `claude:account-a:primary:${Date.parse(RESET_AT)}`
    });
    expect(events[0]?.title).toContain("90%");
  });

  it("delivers a threshold that crossed during cooldown once cooldown expires", () => {
    const detector = new UsageNotificationDetector();
    const settings = notificationSettings({ cooldownMinutes: 30 });
    detector.detect([usage(70)], settings, at(0));
    expect(detector.detect([usage(80)], settings, at(1))[0]).toMatchObject({ type: "threshold", threshold: 75 });

    expect(detector.detect([usage(95)], settings, at(10))).toEqual([]);
    expect(detector.detect([usage(96)], settings, at(30))).toEqual([]);
    expect(detector.detect([usage(96)], settings, at(31))).toMatchObject([
      { type: "threshold", threshold: 90 }
    ]);
    expect(detector.detect([usage(97)], settings, at(62))).toEqual([]);
  });

  it("drops a pending threshold if usage falls below it before cooldown expires", () => {
    const detector = new UsageNotificationDetector();
    const settings = notificationSettings({ cooldownMinutes: 30 });
    detector.detect([usage(70)], settings, at(0));
    detector.detect([usage(80)], settings, at(1));
    detector.detect([usage(95)], settings, at(10));

    expect(detector.detect([usage(85)], settings, at(20))).toEqual([]);
    expect(detector.detect([usage(85)], settings, at(31))).toEqual([]);
    expect(detector.detect([usage(95)], settings, at(32))).toMatchObject([
      { type: "threshold", threshold: 90 }
    ]);
  });

  it("keeps projected exhaustion pending while cooldown is active", () => {
    const detector = new UsageNotificationDetector();
    const settings = notificationSettings({ cooldownMinutes: 30 });
    detector.detect([usage(70)], settings, at(0));

    const withProjection = usage(80, { window: projectedWindow(80) });
    expect(detector.detect([withProjection], settings, at(1))).toMatchObject([
      { type: "threshold", threshold: 75 }
    ]);
    expect(detector.detect([withProjection], settings, at(20))).toEqual([]);
    expect(detector.detect([withProjection], settings, at(31))).toMatchObject([
      {
        type: "projected-exhaustion",
        estimatedExhaustedAt: "2026-08-09T12:00:00.000Z"
      }
    ]);
    expect(detector.detect([withProjection], settings, at(62))).toEqual([]);
  });

  it("sends projected exhaustion only once per reset epoch", () => {
    const detector = new UsageNotificationDetector();
    const settings = notificationSettings({ cooldownMinutes: 0, claude: { thresholds: [90] } });
    detector.detect([usage(50)], settings, at(0));
    const projected = usage(60, { window: projectedWindow(60) });

    expect(detector.detect([projected], settings, at(1))[0]?.type).toBe("projected-exhaustion");
    expect(detector.detect([projected], settings, at(2))).toEqual([]);

    const nextEpoch = usage(60, {
      window: projectedWindow(60, {
        resetsAt: "2026-08-09T20:00:00.000Z",
        pace: {
          confidence: "low",
          sampleCount: 3,
          sampleSpanMinutes: 25,
          estimatedExhaustedAt: "2026-08-09T18:00:00.000Z"
        }
      })
    });
    expect(detector.detect([nextEpoch], settings, at(3))).toEqual([]);
    expect(detector.detect([nextEpoch], settings, at(4))[0]).toMatchObject({
      type: "projected-exhaustion",
      resetEpoch: Date.parse("2026-08-09T20:00:00.000Z")
    });
  });

  it("requires low/good pace confidence and exhaustion before reset", () => {
    const detector = new UsageNotificationDetector();
    const settings = notificationSettings({ cooldownMinutes: 0, claude: { thresholds: [90] } });
    detector.detect([usage(40)], settings, at(0));

    const insufficient = usage(50, {
      window: projectedWindow(50, {
        pace: {
          confidence: "insufficient",
          sampleCount: 1,
          sampleSpanMinutes: 1,
          estimatedExhaustedAt: "2026-08-09T12:00:00.000Z"
        }
      })
    });
    expect(detector.detect([insufficient], settings, at(1))).toEqual([]);

    const afterReset = usage(60, {
      window: projectedWindow(60, {
        pace: {
          confidence: "good",
          sampleCount: 4,
          sampleSpanMinutes: 35,
          estimatedExhaustedAt: "2026-08-09T15:00:00.000Z"
        }
      })
    });
    expect(detector.detect([afterReset], settings, at(2))).toEqual([]);
  });

  it("lets reset notifications bypass cooldown and rearms the cycle", () => {
    const detector = new UsageNotificationDetector();
    const settings = notificationSettings({ cooldownMinutes: 30 });
    detector.detect([usage(70)], settings, at(0));
    detector.detect([usage(80)], settings, at(1));

    expect(detector.detect([usage(0)], settings, at(2))).toMatchObject([{ type: "reset", percent: 0 }]);
    expect(detector.detect([usage(0)], settings, at(3))).toEqual([]);
    detector.detect([usage(70)], settings, at(4));
    expect(detector.detect([usage(80)], settings, at(5))).toMatchObject([
      { type: "threshold", threshold: 75 }
    ]);
  });

  it("ignores stale/error samples but preserves the last valid observation", () => {
    const detector = new UsageNotificationDetector();
    const settings = notificationSettings();
    detector.detect([usage(40)], settings, at(0));

    expect(detector.detect([usage(0, { status: "error" })], settings, at(1))).toEqual([]);
    expect(detector.detect([usage(0, { stale: true })], settings, at(2))).toEqual([]);
    expect(detector.detect([usage(0)], settings, at(3))).toMatchObject([{ type: "reset" }]);
  });

  it("clears observations for signed-out, unavailable, and missing providers", () => {
    const settings = notificationSettings();

    const signedOutDetector = new UsageNotificationDetector();
    signedOutDetector.detect([usage(40)], settings, at(0));
    signedOutDetector.detect([usage(0, { status: "signed-out" })], settings, at(1));
    expect(signedOutDetector.detect([usage(0)], settings, at(2))).toEqual([]);

    const unavailableDetector = new UsageNotificationDetector();
    unavailableDetector.detect([usage(40)], settings, at(0));
    unavailableDetector.detect([usage(0, { window: { available: false, quality: "unavailable" } })], settings, at(1));
    expect(unavailableDetector.detect([usage(0)], settings, at(2))).toEqual([]);

    const missingDetector = new UsageNotificationDetector();
    missingDetector.detect([usage(40)], settings, at(0));
    missingDetector.detect([], settings, at(1));
    expect(missingDetector.detect([usage(0)], settings, at(2))).toEqual([]);
  });

  it("consumes crossings that happen while globally/provider disabled or quiet", () => {
    const globallyDisabled = new UsageNotificationDetector();
    globallyDisabled.detect([usage(70)], notificationSettings({ enabled: false }), at(0));
    globallyDisabled.detect([usage(80)], notificationSettings({ enabled: false }), at(1));
    expect(globallyDisabled.detect([usage(81)], notificationSettings(), at(2))).toEqual([]);

    const providerDisabled = new UsageNotificationDetector();
    providerDisabled.detect([usage(70)], notificationSettings({ claude: { enabled: false } }), at(0));
    providerDisabled.detect([usage(80)], notificationSettings({ claude: { enabled: false } }), at(1));
    expect(providerDisabled.detect([usage(81)], notificationSettings(), at(2))).toEqual([]);

    const quiet = new UsageNotificationDetector();
    const quietSettings = notificationSettings({
      quietHours: { enabled: true, start: "22:00", end: "08:00" }
    });
    quiet.detect([usage(70)], quietSettings, new Date(2026, 7, 9, 21, 0));
    quiet.detect([usage(80)], quietSettings, new Date(2026, 7, 9, 23, 0));
    expect(quiet.detect([usage(81)], quietSettings, new Date(2026, 7, 10, 9, 0))).toEqual([]);
  });

  it("treats a changed account as a first observation", () => {
    const detector = new UsageNotificationDetector();
    detector.detect([usage(70)], notificationSettings(), at(0));

    expect(
      detector.detect([usage(95, { resetTrackingId: "account-b" })], notificationSettings(), at(1))
    ).toEqual([]);
  });
});

describe("isWithinQuietHours", () => {
  it("handles ordinary and cross-midnight ranges with an exclusive end", () => {
    expect(
      isWithinQuietHours({ enabled: true, start: "09:00", end: "12:00" }, new Date(2026, 7, 9, 10, 0))
    ).toBe(true);
    expect(
      isWithinQuietHours({ enabled: true, start: "22:00", end: "08:00" }, new Date(2026, 7, 9, 23, 0))
    ).toBe(true);
    expect(
      isWithinQuietHours({ enabled: true, start: "22:00", end: "08:00" }, new Date(2026, 7, 10, 7, 59))
    ).toBe(true);
    expect(
      isWithinQuietHours({ enabled: true, start: "22:00", end: "08:00" }, new Date(2026, 7, 10, 8, 0))
    ).toBe(false);
  });

  it("does not silence notifications for disabled, invalid, or zero-length ranges", () => {
    const now = new Date(2026, 7, 9, 23, 0);
    expect(isWithinQuietHours({ enabled: false, start: "22:00", end: "08:00" }, now)).toBe(false);
    expect(isWithinQuietHours({ enabled: true, start: "bad", end: "08:00" }, now)).toBe(false);
    expect(isWithinQuietHours({ enabled: true, start: "22:00", end: "22:00" }, now)).toBe(false);
  });
});
