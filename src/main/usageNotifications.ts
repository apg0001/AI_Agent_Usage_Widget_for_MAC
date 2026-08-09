import type {
  NotificationSettings,
  ProviderId,
  ProviderUsage,
  QuietHoursSettings,
  UsageLimitWindow
} from "../shared/types.js";

const RESET_EPOCH_TOLERANCE_MS = 5 * 60_000;

type NotificationMetric = {
  baseKey: string;
  provider: ProviderId;
  providerLabel: string;
  resetTrackingId: string;
  window: UsageLimitWindow;
};

type MetricState = {
  provider: ProviderId;
  percent: number;
  resetAt?: number;
  notifiedThresholds: Set<number>;
  pendingThresholds: Set<number>;
  projectedNotified: boolean;
  projectedPending: boolean;
  lastNotificationAt?: number;
};

export type UsageNotificationEvent = {
  type: "threshold" | "reset" | "projected-exhaustion";
  provider: ProviderId;
  providerLabel: string;
  resetTrackingId: string;
  resetEpoch?: number;
  windowId: string;
  windowLabel: string;
  percent: number;
  threshold?: number;
  resetsAt?: string;
  estimatedExhaustedAt?: string;
  key: string;
};

type NotificationNow = Date | number;

function asDate(now: NotificationNow) {
  return now instanceof Date ? now : new Date(now);
}

function timeToMinutes(value: string) {
  const match = /^(?:([01]\d|2[0-3])):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
}

/** Shared quiet-hours policy for usage and service-status notifications. */
export function isWithinQuietHours(settings: QuietHoursSettings, now: NotificationNow = new Date()) {
  if (!settings.enabled) {
    return false;
  }

  const start = timeToMinutes(settings.start);
  const end = timeToMinutes(settings.end);
  const date = asDate(now);
  if (start === undefined || end === undefined || Number.isNaN(date.getTime()) || start === end) {
    return false;
  }

  const current = date.getHours() * 60 + date.getMinutes();
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function parseResetAt(window: UsageLimitWindow) {
  const value = window.resetsAt ? Date.parse(window.resetsAt) : Number.NaN;
  return Number.isFinite(value) ? value : undefined;
}

function resetEpochChanged(previous: MetricState, currentResetAt: number | undefined) {
  if (previous.resetAt === undefined || currentResetAt === undefined) {
    return previous.resetAt !== currentResetAt;
  }
  return Math.abs(previous.resetAt - currentResetAt) > RESET_EPOCH_TOLERANCE_MS;
}

function isUnavailable(window: UsageLimitWindow) {
  return (
    window.available === false ||
    window.quality === "unavailable" ||
    window.message === "사용량 없음" ||
    !Number.isFinite(window.percent) ||
    window.percent < 0
  );
}

function metricsForUsage(usage: ProviderUsage): NotificationMetric[] {
  const resetTrackingId = usage.resetTrackingId?.trim() || "default";
  const windows: UsageLimitWindow[] = usage.windows?.length
    ? usage.windows
    : [{ id: "overall", label: "전체 한도", percent: usage.percent, resetsAt: usage.resetsAt }];

  return windows
    .filter((window) => !isUnavailable(window))
    .map((window) => ({
      baseKey: `${usage.provider}:${resetTrackingId}:${window.id}`,
      provider: usage.provider,
      providerLabel: usage.label,
      resetTrackingId,
      window
    }));
}

function normalizedThresholds(thresholds: number[]) {
  return [...new Set(thresholds)]
    .filter((threshold) => Number.isFinite(threshold) && threshold > 0 && threshold <= 100)
    .sort((left, right) => left - right);
}

function cycleKey(metric: NotificationMetric, resetEpoch: number | undefined) {
  return `${metric.baseKey}:${resetEpoch ?? "unknown"}`;
}

function isCoolingDown(state: MetricState, nowMs: number, cooldownMs: number) {
  return state.lastNotificationAt !== undefined && nowMs - state.lastNotificationAt < cooldownMs;
}

function freshState(metric: NotificationMetric, resetAt: number | undefined): MetricState {
  return {
    provider: metric.provider,
    percent: metric.window.percent,
    resetAt,
    notifiedThresholds: new Set<number>(),
    pendingThresholds: new Set<number>(),
    projectedNotified: false,
    projectedPending: false
  };
}

export class UsageNotificationDetector {
  private readonly states = new Map<string, MetricState>();

  detect(
    usages: ProviderUsage[],
    settings: NotificationSettings,
    now: NotificationNow = new Date()
  ): UsageNotificationEvent[] {
    const date = asDate(now);
    const nowMs = date.getTime();
    if (!Number.isFinite(nowMs)) {
      throw new RangeError("now must be a valid date");
    }

    const events: UsageNotificationEvent[] = [];
    const presentProviders = new Set(usages.map((usage) => usage.provider));
    for (const [key, state] of this.states) {
      if (!presentProviders.has(state.provider)) {
        this.states.delete(key);
      }
    }

    const quiet = isWithinQuietHours(settings.quietHours, date);
    const cooldownMs = Math.max(0, settings.cooldownMinutes) * 60_000;

    for (const usage of usages) {
      if (usage.status === "signed-out" || usage.connectionStatus === "signed-out") {
        this.clearProvider(usage.provider);
        continue;
      }
      if (usage.status === "error" || usage.stale) {
        continue;
      }

      const metrics = metricsForUsage(usage);
      const currentKeys = new Set(metrics.map((metric) => metric.baseKey));
      this.clearMissingMetrics(usage.provider, currentKeys);
      const providerSettings = settings.providers[usage.provider];
      const notificationEnabled = settings.enabled && providerSettings.enabled && !quiet;

      for (const metric of metrics) {
        const currentResetAt = parseResetAt(metric.window);
        const previous = this.states.get(metric.baseKey);

        // Never alert from a first observation, even if it starts above a threshold.
        if (!previous) {
          this.states.set(metric.baseKey, freshState(metric, currentResetAt));
          continue;
        }

        const epochChanged = resetEpochChanged(previous, currentResetAt);
        let currentState: MetricState;
        if (epochChanged) {
          currentState = freshState(metric, currentResetAt);
        } else {
          currentState = {
            ...previous,
            percent: metric.window.percent,
            notifiedThresholds: new Set(previous.notifiedThresholds),
            pendingThresholds: new Set(previous.pendingThresholds)
          };
        }

        const key = cycleKey(metric, currentState.resetAt);
        const resetDetected = previous.percent > 0 && metric.window.percent === 0;
        if (resetDetected) {
          // A real reset rearms every per-cycle notification, regardless of whether
          // the reset notification itself is disabled or silenced by quiet hours.
          currentState.notifiedThresholds.clear();
          currentState.pendingThresholds.clear();
          currentState.projectedNotified = false;
          currentState.projectedPending = false;
          currentState.lastNotificationAt = undefined;

          if (notificationEnabled && providerSettings.resetEnabled) {
            events.push({
              type: "reset",
              provider: metric.provider,
              providerLabel: metric.providerLabel,
              resetTrackingId: metric.resetTrackingId,
              resetEpoch: currentState.resetAt,
              windowId: metric.window.id,
              windowLabel: metric.window.label,
              percent: metric.window.percent,
              resetsAt: metric.window.resetsAt,
              key
            });
          }

          this.states.set(metric.baseKey, currentState);
          continue;
        }

        // A changed epoch is a new observation cycle. Keep the reset edge above,
        // but do not infer threshold/projection alerts from its first sample.
        if (epochChanged) {
          this.states.set(metric.baseKey, currentState);
          continue;
        }

        const thresholds = normalizedThresholds(providerSettings.thresholds);
        const configuredThresholds = new Set(thresholds);
        for (const threshold of currentState.pendingThresholds) {
          if (!configuredThresholds.has(threshold) || metric.window.percent < threshold) {
            currentState.pendingThresholds.delete(threshold);
          }
        }

        const crossedThresholds = thresholds.filter(
          (threshold) =>
            previous.percent < threshold &&
            metric.window.percent >= threshold &&
            !currentState.notifiedThresholds.has(threshold)
        );
        for (const threshold of crossedThresholds) {
          currentState.pendingThresholds.add(threshold);
        }

        if (!notificationEnabled) {
          // Quiet/disabled notifications are intentionally consumed rather than
          // replayed later. Cooldown suppression is handled differently below.
          for (const threshold of currentState.pendingThresholds) {
            currentState.notifiedThresholds.add(threshold);
          }
          currentState.pendingThresholds.clear();
        } else if (!isCoolingDown(currentState, nowMs, cooldownMs)) {
          const eligiblePending = [...currentState.pendingThresholds]
            .filter((threshold) => metric.window.percent >= threshold)
            .sort((left, right) => left - right);
          const highestThreshold = eligiblePending.at(-1);
          if (highestThreshold !== undefined) {
            events.push({
              type: "threshold",
              provider: metric.provider,
              providerLabel: metric.providerLabel,
              resetTrackingId: metric.resetTrackingId,
              resetEpoch: currentState.resetAt,
              windowId: metric.window.id,
              windowLabel: metric.window.label,
              percent: metric.window.percent,
              threshold: highestThreshold,
              resetsAt: metric.window.resetsAt,
              key
            });
            for (const threshold of eligiblePending) {
              currentState.notifiedThresholds.add(threshold);
              currentState.pendingThresholds.delete(threshold);
            }
            currentState.lastNotificationAt = nowMs;
          }
        }

        const exhaustionAt = metric.window.pace?.estimatedExhaustedAt;
        const exhaustionMs = exhaustionAt ? Date.parse(exhaustionAt) : Number.NaN;
        const resetMs = parseResetAt(metric.window);
        const paceReady = metric.window.pace?.confidence === "low" || metric.window.pace?.confidence === "good";
        const projectedToRunOut =
          paceReady &&
          Number.isFinite(exhaustionMs) &&
          resetMs !== undefined &&
          exhaustionMs < resetMs;

        if (!projectedToRunOut) {
          currentState.projectedPending = false;
        } else if (!currentState.projectedNotified) {
          if (!notificationEnabled || !providerSettings.projectedExhaustionEnabled) {
            currentState.projectedNotified = true;
            currentState.projectedPending = false;
          } else if (isCoolingDown(currentState, nowMs, cooldownMs)) {
            // Unlike quiet/disabled suppression, cooldown keeps the alert pending.
            currentState.projectedPending = true;
          } else if (exhaustionAt) {
            events.push({
              type: "projected-exhaustion",
              provider: metric.provider,
              providerLabel: metric.providerLabel,
              resetTrackingId: metric.resetTrackingId,
              resetEpoch: currentState.resetAt,
              windowId: metric.window.id,
              windowLabel: metric.window.label,
              percent: metric.window.percent,
              resetsAt: metric.window.resetsAt,
              estimatedExhaustedAt: exhaustionAt,
              key
            });
            currentState.projectedNotified = true;
            currentState.projectedPending = false;
            currentState.lastNotificationAt = nowMs;
          }
        }

        this.states.set(metric.baseKey, currentState);
      }
    }

    return events;
  }

  private clearProvider(provider: ProviderId) {
    for (const [key, state] of this.states) {
      if (state.provider === provider) {
        this.states.delete(key);
      }
    }
  }

  private clearMissingMetrics(provider: ProviderId, currentKeys: Set<string>) {
    for (const [key, state] of this.states) {
      if (state.provider === provider && !currentKeys.has(key)) {
        this.states.delete(key);
      }
    }
  }
}
