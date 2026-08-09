import type { UsageHistoryPoint, UsageHistoryRange } from "../../shared/types";

export type HistoryAxisTick = {
  timestamp: string;
  ratio: 0 | 0.5 | 1;
  position: "start" | "middle" | "end";
  label: string;
  fullLabel: string;
};

type HistoryAxisOptions = {
  locale?: string;
  timeZone?: string;
};

type TimestampParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  offset: string;
};

type LabelMode =
  | "time"
  | "date"
  | "year-date"
  | "date-time"
  | "year-date-time"
  | "date-time-seconds"
  | "year-date-time-seconds"
  | "time-offset";

function formatterOptions(timeZone?: string): Intl.DateTimeFormatOptions {
  return timeZone ? { timeZone } : {};
}

function partsFor(timestamp: number, timeZone?: string): TimestampParts {
  const date = new Date(timestamp);
  const parts = new Intl.DateTimeFormat("en-GB", {
    ...formatterOptions(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "shortOffset"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "0";

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    second: Number(value("second")),
    millisecond: date.getUTCMilliseconds(),
    offset: value("timeZoneName")
  };
}

function sameDate(left: TimestampParts, right: TimestampParts) {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function compactOffset(offset: string) {
  if (offset === "GMT" || offset === "UTC") {
    return "Z";
  }
  return offset.replace(/^GMT/, "");
}

function labelFor(parts: TimestampParts, mode: LabelMode) {
  const date = `${parts.month}/${parts.day}`;
  const yearDate = `${parts.year}/${date}`;
  const time = `${pad(parts.hour)}:${pad(parts.minute)}`;
  const seconds = `${time}:${pad(parts.second)}`;

  switch (mode) {
    case "time":
      return time;
    case "date":
      return date;
    case "year-date":
      return yearDate;
    case "date-time":
      return `${date} ${time}`;
    case "year-date-time":
      return `${yearDate} ${time}`;
    case "date-time-seconds":
      return `${date} ${seconds}`;
    case "year-date-time-seconds":
      return `${yearDate} ${seconds}`;
    case "time-offset":
      return `${seconds}.${pad(parts.millisecond, 3)} ${compactOffset(parts.offset)}`;
  }
}

function labelModes(range: UsageHistoryRange, first: TimestampParts, last: TimestampParts): LabelMode[] {
  if (range === "24h") {
    return sameDate(first, last)
      ? ["time", "date-time", "date-time-seconds", "time-offset"]
      : ["date-time", "date-time-seconds", "time-offset"];
  }

  if (first.year !== last.year) {
    return ["year-date", "year-date-time", "year-date-time-seconds", "time-offset"];
  }

  return sameDate(first, last)
    ? ["date-time", "date-time-seconds", "time-offset"]
    : ["date", "date-time", "date-time-seconds", "time-offset"];
}

function fullLabel(timestamp: number, locale: string, timeZone?: string) {
  return new Intl.DateTimeFormat(locale, {
    ...formatterOptions(timeZone),
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "shortOffset"
  }).format(new Date(timestamp));
}

export function normalizeHistoryPoints(points: UsageHistoryPoint[]) {
  const byTimestamp = new Map<number, UsageHistoryPoint>();

  for (const point of points) {
    const timestamp = Date.parse(point.observedAt);
    if (
      !Number.isFinite(timestamp) ||
      !Number.isFinite(point.percent) ||
      point.percent < 0 ||
      point.percent > 100
    ) {
      continue;
    }
    byTimestamp.set(timestamp, point);
  }

  return [...byTimestamp.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, point]) => point);
}

export function buildHistoryAxisTicks(
  points: UsageHistoryPoint[],
  range: UsageHistoryRange,
  options: HistoryAxisOptions = {}
): HistoryAxisTick[] {
  const normalized = normalizeHistoryPoints(points);
  if (!normalized.length) {
    return [];
  }

  const firstTimestamp = Date.parse(normalized[0].observedAt);
  const lastTimestamp = Date.parse(normalized.at(-1)!.observedAt);
  const rawTicks: Array<Pick<HistoryAxisTick, "ratio" | "position"> & { value: number }> =
    firstTimestamp === lastTimestamp
      ? [{ value: firstTimestamp, ratio: 0.5, position: "middle" }]
      : [
          { value: firstTimestamp, ratio: 0, position: "start" },
          { value: firstTimestamp + (lastTimestamp - firstTimestamp) / 2, ratio: 0.5, position: "middle" },
          { value: lastTimestamp, ratio: 1, position: "end" }
        ];
  const tickParts = rawTicks.map((tick) => partsFor(tick.value, options.timeZone));
  const modes = labelModes(range, tickParts[0], tickParts.at(-1)!);
  let labels = tickParts.map((parts) => labelFor(parts, modes.at(-1)!));

  for (const mode of modes) {
    const candidates = tickParts.map((parts) => labelFor(parts, mode));
    labels = candidates;
    if (new Set(candidates).size === candidates.length) {
      break;
    }
  }

  const locale = options.locale ?? "ko-KR";
  return rawTicks.map((tick, index) => ({
    timestamp: new Date(tick.value).toISOString(),
    ratio: tick.ratio,
    position: tick.position,
    label: labels[index],
    fullLabel: fullLabel(tick.value, locale, options.timeZone)
  }));
}
