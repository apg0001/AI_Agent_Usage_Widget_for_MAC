import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ProviderHistory,
  ProviderId,
  ProviderUsage,
  UsageDataQuality,
  UsageHistoryPoint,
  UsageHistoryRange,
  UsageLimitWindow
} from "../shared/types.js";

const HISTORY_VERSION = 1;
const HEARTBEAT_MS = 5 * 60_000;
const RETENTION_MS = 30 * 24 * 60 * 60_000;
const FULL_RESOLUTION_RETENTION_MS = 24 * 60 * 60_000;
const MEDIUM_RESOLUTION_RETENTION_MS = 7 * 24 * 60 * 60_000;
const MEDIUM_RESOLUTION_BUCKET_MS = 30 * 60_000;
const LONG_RESOLUTION_BUCKET_MS = 2 * 60 * 60_000;
export const HISTORY_MAX_POINTS = 50_000;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

const RANGE_MS: Record<UsageHistoryRange, number> = {
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
  "30d": RETENTION_MS
};

type HistoryFile = {
  version: number;
  points: UsageHistoryPoint[];
};

type Clock = () => number;

function isProviderId(value: unknown): value is ProviderId {
  return value === "codex" || value === "claude" || value === "gemini";
}

function isQuality(value: unknown): value is UsageDataQuality {
  return value === "exact" || value === "estimated" || value === "unavailable";
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function sanitizePoint(value: unknown): UsageHistoryPoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const point = value as Partial<UsageHistoryPoint>;
  if (
    !isProviderId(point.provider) ||
    typeof point.windowId !== "string" ||
    !point.windowId ||
    typeof point.windowLabel !== "string" ||
    !Number.isFinite(point.percent) ||
    Number(point.percent) < 0 ||
    Number(point.percent) > 100 ||
    !validTimestamp(point.observedAt) ||
    typeof point.trackingId !== "string" ||
    !point.trackingId ||
    !isQuality(point.quality)
  ) {
    return null;
  }

  if (point.resetsAt !== undefined && !validTimestamp(point.resetsAt)) {
    return null;
  }

  return {
    provider: point.provider,
    windowId: point.windowId.slice(0, 100),
    windowLabel: point.windowLabel.slice(0, 200),
    percent: Number(point.percent),
    observedAt: point.observedAt,
    resetsAt: point.resetsAt,
    trackingId: point.trackingId.slice(0, 256),
    quality: point.quality
  };
}

function sourceQuality(usage: ProviderUsage): UsageDataQuality {
  return usage.source === "token" || usage.source === "demo" ? "estimated" : "exact";
}

function isWindowAvailable(window: UsageLimitWindow) {
  return window.available !== false && window.quality !== "unavailable" && window.message !== "제공 안 됨";
}

function observedAtFor(usage: ProviderUsage, window?: UsageLimitWindow) {
  return window?.dataUpdatedAt ?? usage.freshness?.observedAt ?? usage.dataUpdatedAt ?? usage.updatedAt;
}

function metricPoints(usage: ProviderUsage): UsageHistoryPoint[] {
  if (
    usage.stale ||
    usage.status === "error" ||
    usage.status === "signed-out" ||
    usage.connectionStatus === "signed-out"
  ) {
    return [];
  }

  const trackingId = usage.resetTrackingId ?? "default";
  const windows = usage.windows?.length
    ? usage.windows
    : [
        {
          id: "overall",
          label: "사용량",
          percent: usage.percent,
          resetsAt: usage.resetsAt,
          dataUpdatedAt: usage.dataUpdatedAt,
          quality: sourceQuality(usage)
        } satisfies UsageLimitWindow
      ];

  return windows.flatMap((window) => {
    const quality = window.quality ?? sourceQuality(usage);
    const observedAt = observedAtFor(usage, window);
    if (
      !isWindowAvailable(window) ||
      quality === "unavailable" ||
      !Number.isFinite(window.percent) ||
      window.percent < 0 ||
      window.percent > 100 ||
      !validTimestamp(observedAt) ||
      (window.resetsAt !== undefined && !validTimestamp(window.resetsAt))
    ) {
      return [];
    }

    return [
      {
        provider: usage.provider,
        windowId: window.id,
        windowLabel: window.label,
        percent: window.percent,
        observedAt,
        resetsAt: window.resetsAt,
        trackingId,
        quality
      }
    ];
  });
}

function metricKey(point: UsageHistoryPoint) {
  return `${point.provider}\u0000${point.trackingId}\u0000${point.windowId}`;
}

function sameResetEpoch(left?: string, right?: string) {
  if (!left || !right) {
    return left === right;
  }
  return left === right;
}

function shouldAppend(previous: UsageHistoryPoint | undefined, current: UsageHistoryPoint) {
  if (!previous) {
    return true;
  }

  const previousAt = Date.parse(previous.observedAt);
  const currentAt = Date.parse(current.observedAt);
  if (currentAt <= previousAt) {
    return false;
  }

  return (
    previous.percent !== current.percent ||
    !sameResetEpoch(previous.resetsAt, current.resetsAt) ||
    previous.quality !== current.quality ||
    currentAt - previousAt >= HEARTBEAT_MS
  );
}

function clonePoint(point: UsageHistoryPoint): UsageHistoryPoint {
  return { ...point };
}

type PointBucket = {
  first: UsageHistoryPoint;
  last: UsageHistoryPoint;
  minimum: UsageHistoryPoint;
  maximum: UsageHistoryPoint;
};

function resolutionBucketMs(ageMs: number) {
  if (ageMs <= FULL_RESOLUTION_RETENTION_MS) {
    return 0;
  }
  return ageMs <= MEDIUM_RESOLUTION_RETENTION_MS
    ? MEDIUM_RESOLUTION_BUCKET_MS
    : LONG_RESOLUTION_BUCKET_MS;
}

function compactPoints(points: UsageHistoryPoint[], now: number) {
  const fullResolution: UsageHistoryPoint[] = [];
  const buckets = new Map<string, PointBucket>();

  for (const point of points) {
    const timestamp = Date.parse(point.observedAt);
    const bucketMs = resolutionBucketMs(Math.max(0, now - timestamp));
    if (bucketMs === 0) {
      fullResolution.push(point);
      continue;
    }

    const bucketStart = Math.floor(timestamp / bucketMs);
    const key = [
      metricKey(point),
      point.resetsAt ?? "no-reset",
      point.quality,
      bucketMs,
      bucketStart
    ].join("\u0000");
    const bucket = buckets.get(key);
    if (!bucket) {
      buckets.set(key, { first: point, last: point, minimum: point, maximum: point });
      continue;
    }

    bucket.last = point;
    if (point.percent < bucket.minimum.percent) {
      bucket.minimum = point;
    }
    if (point.percent > bucket.maximum.percent) {
      bucket.maximum = point;
    }
  }

  const compacted = [...buckets.values()].flatMap((bucket) =>
    [...new Set([bucket.first, bucket.minimum, bucket.maximum, bucket.last])]
  );
  return [...compacted, ...fullResolution]
    .sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt));
}

export class UsageHistoryStore {
  private points: UsageHistoryPoint[];

  constructor(
    private readonly filePath: string,
    private readonly clock: Clock = Date.now
  ) {
    this.points = this.readFile();
    this.prune();
  }

  record(usages: ProviderUsage | ProviderUsage[]): UsageHistoryPoint[] {
    const now = this.clock();
    const candidates = (Array.isArray(usages) ? usages : [usages])
      .flatMap(metricPoints)
      .filter((point) => Date.parse(point.observedAt) <= now + MAX_FUTURE_SKEW_MS)
      .sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt));

    if (!candidates.length) {
      return [];
    }

    const lastByMetric = new Map<string, UsageHistoryPoint>();
    for (const point of this.points) {
      const key = metricKey(point);
      const previous = lastByMetric.get(key);
      if (!previous || Date.parse(point.observedAt) > Date.parse(previous.observedAt)) {
        lastByMetric.set(key, point);
      }
    }

    const appended: UsageHistoryPoint[] = [];
    for (const candidate of candidates) {
      const key = metricKey(candidate);
      if (!shouldAppend(lastByMetric.get(key), candidate)) {
        continue;
      }
      this.points.push(candidate);
      lastByMetric.set(key, candidate);
      appended.push(candidate);
    }

    if (appended.length) {
      this.prune();
      this.writeFile();
    }
    return appended.map(clonePoint);
  }

  getProviderHistory(
    provider: ProviderId,
    range: UsageHistoryRange,
    filters: { trackingId?: string; windowId?: string } = {}
  ): ProviderHistory {
    this.prune();
    const cutoff = this.clock() - RANGE_MS[range];
    return {
      provider,
      range,
      points: this.points
        .filter(
          (point) =>
            point.provider === provider &&
            Date.parse(point.observedAt) >= cutoff &&
            (filters.trackingId === undefined || point.trackingId === filters.trackingId) &&
            (filters.windowId === undefined || point.windowId === filters.windowId)
        )
        .sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt))
        .map(clonePoint)
    };
  }

  getAllPoints(): UsageHistoryPoint[] {
    this.prune();
    return this.points.map(clonePoint);
  }

  private readFile(): UsageHistoryPoint[] {
    if (!existsSync(this.filePath)) {
      return [];
    }

    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<HistoryFile>;
      if (!Array.isArray(parsed.points)) {
        return [];
      }
      return parsed.points.flatMap((point) => {
        const sanitized = sanitizePoint(point);
        return sanitized ? [sanitized] : [];
      });
    } catch {
      return [];
    }
  }

  private prune() {
    const now = this.clock();
    const cutoff = now - RETENTION_MS;
    const retained = this.points
      .filter((point) => {
        const observedAt = Date.parse(point.observedAt);
        return observedAt >= cutoff && observedAt <= now + MAX_FUTURE_SKEW_MS;
      })
      .sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt));
    this.points = compactPoints(retained, now).slice(-HISTORY_MAX_POINTS);
  }

  private writeFile() {
    const directory = path.dirname(this.filePath);
    mkdirSync(directory, { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${this.clock()}.tmp`;
    const payload: HistoryFile = {
      version: HISTORY_VERSION,
      points: this.points
    };

    try {
      writeFileSync(temporaryPath, JSON.stringify(payload));
      renameSync(temporaryPath, this.filePath);
    } catch (error) {
      if (existsSync(temporaryPath)) {
        rmSync(temporaryPath, { force: true });
      }
      throw error;
    }
  }
}
