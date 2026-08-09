import {
  ProviderUsage,
  UsageDataQuality,
  UsageHistoryPoint,
  UsageLimitWindow,
  UsagePace
} from "../shared/types.js";

const MIN_SAMPLE_COUNT = 2;
const MIN_SAMPLE_SPAN_MS = 5 * 60_000;
const GOOD_SAMPLE_COUNT = 4;
const GOOD_SAMPLE_SPAN_MS = 30 * 60_000;
const RESET_EPOCH_TOLERANCE_MS = 60_000;

function round(value: number, places = 2) {
  const multiplier = 10 ** places;
  return Math.round(value * multiplier) / multiplier;
}

function usageQuality(usage: ProviderUsage, window: UsageLimitWindow): UsageDataQuality {
  if (window.quality) {
    return window.quality;
  }
  return usage.source === "token" || usage.source === "demo" ? "estimated" : "exact";
}

function isAvailable(window: UsageLimitWindow) {
  return window.available !== false && window.quality !== "unavailable" && window.message !== "제공 안 됨";
}

function sameResetEpoch(left?: string, right?: string) {
  if (!left || !right) {
    return left === right;
  }

  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    return left === right;
  }
  return Math.abs(leftTime - rightTime) <= RESET_EPOCH_TOLERANCE_MS;
}

function validHistoryPoint(point: UsageHistoryPoint) {
  return (
    (point.quality === "exact" || point.quality === "estimated") &&
    Number.isFinite(point.percent) &&
    point.percent >= 0 &&
    point.percent <= 100 &&
    Number.isFinite(Date.parse(point.observedAt))
  );
}

function uniqueSortedPoints(points: UsageHistoryPoint[]) {
  const byTimestamp = new Map<number, UsageHistoryPoint>();
  for (const point of points) {
    const timestamp = Date.parse(point.observedAt);
    byTimestamp.set(timestamp, point);
  }
  return [...byTimestamp.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, point]) => point);
}

function confidenceFor(points: UsageHistoryPoint[], spanMs: number): UsagePace["confidence"] {
  if (points.length < MIN_SAMPLE_COUNT || spanMs < MIN_SAMPLE_SPAN_MS) {
    return "insufficient";
  }
  const containsEstimate = points.some((point) => point.quality === "estimated");
  return !containsEstimate && points.length >= GOOD_SAMPLE_COUNT && spanMs >= GOOD_SAMPLE_SPAN_MS ? "good" : "low";
}

function linearBurnRate(points: UsageHistoryPoint[]) {
  const firstTime = Date.parse(points[0].observedAt);
  const xValues = points.map((point) => (Date.parse(point.observedAt) - firstTime) / 3_600_000);
  const meanX = xValues.reduce((sum, value) => sum + value, 0) / xValues.length;
  const meanY = points.reduce((sum, point) => sum + point.percent, 0) / points.length;
  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < points.length; index += 1) {
    const xDelta = xValues[index] - meanX;
    numerator += xDelta * (points[index].percent - meanY);
    denominator += xDelta * xDelta;
  }

  return denominator > 0 ? Math.max(0, numerator / denominator) : 0;
}

export function calculateUsagePace(
  usage: ProviderUsage,
  window: UsageLimitWindow,
  history: UsageHistoryPoint[],
  now = Date.now()
): UsagePace | undefined {
  const currentQuality = usageQuality(usage, window);
  if (
    usage.stale ||
    usage.status === "error" ||
    usage.status === "signed-out" ||
    usage.connectionStatus === "signed-out" ||
    !isAvailable(window) ||
    currentQuality === "unavailable"
  ) {
    return undefined;
  }

  const trackingId = usage.resetTrackingId ?? "default";
  const points = uniqueSortedPoints(
    history.filter(
      (point) =>
        point.provider === usage.provider &&
        point.trackingId === trackingId &&
        point.windowId === window.id &&
        sameResetEpoch(point.resetsAt, window.resetsAt) &&
        validHistoryPoint(point) &&
        Date.parse(point.observedAt) <= now + RESET_EPOCH_TOLERANCE_MS
    )
  );

  const firstAt = points[0] ? Date.parse(points[0].observedAt) : now;
  const lastAt = points.at(-1) ? Date.parse(points.at(-1)!.observedAt) : firstAt;
  const spanMs = Math.max(0, lastAt - firstAt);
  const sampleSpanMinutes = round(spanMs / 60_000);
  const historyConfidence = confidenceFor(points, spanMs);
  const confidence = historyConfidence === "good" && currentQuality === "estimated" ? "low" : historyConfidence;
  if (confidence === "insufficient") {
    return {
      confidence,
      sampleCount: points.length,
      sampleSpanMinutes
    };
  }

  const burnRatePercentPerHour = round(linearBurnRate(points));
  const pace: UsagePace = {
    confidence,
    burnRatePercentPerHour,
    sampleCount: points.length,
    sampleSpanMinutes
  };
  const resetAt = window.resetsAt ? Date.parse(window.resetsAt) : Number.NaN;

  if (Number.isFinite(resetAt)) {
    const remainingHours = Math.max(0, resetAt - now) / 3_600_000;
    pace.projectedPercentAtReset = round(Math.min(100, window.percent + burnRatePercentPerHour * remainingHours), 1);
  }

  if (window.percent >= 100) {
    pace.estimatedExhaustedAt = new Date(now).toISOString();
  } else if (burnRatePercentPerHour > 0) {
    const exhaustedAt = now + ((100 - window.percent) / burnRatePercentPerHour) * 3_600_000;
    if (!Number.isFinite(resetAt) || exhaustedAt <= resetAt) {
      pace.estimatedExhaustedAt = new Date(exhaustedAt).toISOString();
    }
  }

  return pace;
}

export function enrichProviderUsageWithInsights(
  usage: ProviderUsage,
  history: UsageHistoryPoint[],
  now = Date.now()
): ProviderUsage {
  if (!usage.windows?.length) {
    return usage;
  }

  return {
    ...usage,
    windows: usage.windows.map((window) => {
      const pace = calculateUsagePace(usage, window, history, now);
      return pace ? { ...window, pace } : { ...window };
    })
  };
}

export function enrichUsageWithInsights(
  usages: ProviderUsage[],
  history: UsageHistoryPoint[],
  now = Date.now()
): ProviderUsage[] {
  return usages.map((usage) => enrichProviderUsageWithInsights(usage, history, now));
}
