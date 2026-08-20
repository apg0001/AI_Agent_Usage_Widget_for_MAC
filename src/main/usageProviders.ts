import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { platformAdapter } from "./platform/index.js";
import { getTranslations, Language } from "../shared/i18n.js";
import { AppSettings, ProviderAuth, ProviderId, ProviderUsage, PROVIDERS, UsageLimitWindow } from "../shared/types.js";

type ProviderAdapter = {
  id: ProviderId;
  label: string;
  fetchUsage: (auth: ProviderAuth | undefined, language: Language) => Promise<Omit<ProviderUsage, "provider" | "label" | "updatedAt">>;
};

type UsageWindowInput = {
  id: string;
  label: string;
  percent: number;
  resetsAt?: string;
  message?: string;
  available?: boolean;
  quality?: UsageLimitWindow["quality"];
  dataUpdatedAt?: string;
  windowDurationMinutes?: number;
};

type UsageResult = Omit<ProviderUsage, "provider" | "label" | "updatedAt">;

const lastSuccessfulUsage = new Map<ProviderId, UsageResult>();
const CODEX_MIN_REFRESH_MS = 60_000;
const CODEX_REQUEST_TIMEOUT_MS = 15_000;
const CODEX_LOCAL_SCAN_INTERVAL_MS = 60_000;
const CODEX_LOCAL_FRESHNESS_MS = 2 * 60_000;
const CODEX_SESSION_TAIL_BYTES = 512 * 1_024;
const CLAUDE_MIN_REFRESH_MS = 60_000;
const CLAUDE_MAX_BACKOFF_MS = 15 * 60_000;
const CLAUDE_REQUEST_TIMEOUT_MS = 15_000;

class CodexUsageApiError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs?: number,
    language: Language = "ko"
  ) {
    super(getTranslations(language).usage.codexApiError(status));
    this.name = "CodexUsageApiError";
  }
}

class ClaudeUsageApiError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs?: number,
    language: Language = "ko"
  ) {
    super(getTranslations(language).usage.claudeApiError(status));
    this.name = "ClaudeUsageApiError";
  }
}

type ClaudeRequestState = {
  accessToken: string | null;
  resetTrackingId: string | null;
  hasRefreshCredential: boolean;
  nextAttemptAt: number;
  failureCount: number;
  lastError: Error | null;
  inFlight: Promise<UsageResult> | null;
};

type ClaudeSession = {
  accessToken: string;
  resetTrackingId: string;
  hasRefreshCredential: boolean;
  refreshToken?: string;
};

type ClaudeTokenRefreshOutcome =
  | { status: "ok"; accessToken: string; refreshToken: string; expiresAt?: number }
  | { status: "invalid" }
  | { status: "error" };

const CLAUDE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const CLAUDE_OAUTH_TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const CLAUDE_REFRESH_FALLBACK_TTL_MS = 55 * 60_000;

let claudeRefreshedCredential: {
  resetTrackingId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
} | null = null;
let claudeInvalidRefreshToken: string | null = null;

function createClaudeRequestState(
  accessToken: string | null,
  resetTrackingId: string | null,
  hasRefreshCredential = false
): ClaudeRequestState {
  return {
    accessToken,
    resetTrackingId,
    hasRefreshCredential,
    nextAttemptAt: 0,
    failureCount: 0,
    lastError: null,
    inFlight: null
  };
}

let claudeRequestState = createClaudeRequestState(null, null);
let codexNextAttemptAt = 0;
let codexLastError: Error | null = null;
let codexInFlight: Promise<UsageResult | null> | null = null;
let codexSessionFingerprint: string | null = null;
let codexLocalCache: { nextScanAt: number; usage: UsageResult | null } = { nextScanAt: 0, usage: null };

function configuredDirectory(environmentVariable: string, fallback: string) {
  const configured = process.env[environmentVariable]?.trim();
  return configured ? path.resolve(configured) : fallback;
}

function codexConfigDirectory() {
  return configuredDirectory("CODEX_HOME", path.join(homedir(), ".codex"));
}

function claudeConfigDirectory() {
  return configuredDirectory("CLAUDE_CONFIG_DIR", path.join(homedir(), ".claude"));
}

export function formatRemaining(resetsAt?: string, language: Language = "ko") {
  if (!resetsAt) {
    return undefined;
  }

  const diffMs = new Date(resetsAt).getTime() - Date.now();
  if (Number.isNaN(diffMs)) {
    return undefined;
  }
  const t = getTranslations(language);
  if (diffMs <= 0) {
    return t.usage.resettingNow;
  }

  const totalMinutes = Math.ceil(diffMs / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return t.usage.daysHoursMinutes(days, hours, minutes);
  }
  return hours > 0 ? t.usage.hoursMinutes(hours, minutes) : t.usage.minutesOnly(minutes);
}

function withReset<T extends Omit<ProviderUsage, "provider" | "label" | "updatedAt">>(usage: T, language: Language): T {
  return {
    ...usage,
    resetRemaining: usage.resetRemaining ?? formatRemaining(usage.resetsAt, language),
    windows: usage.windows?.map((window) => ({
      ...window,
      resetRemaining: window.resetRemaining ?? formatRemaining(window.resetsAt, language)
    }))
  };
}

function isLocalProviderDetectionEnabled() {
  return process.env.AI_USAGE_WIDGET_DISABLE_LOCAL_DETECTION !== "1";
}

function getStatus(percent: number): ProviderUsage["status"] {
  return percent >= 90 ? "critical" : percent >= 75 ? "warning" : "ok";
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function unixSecondsToIso(value?: number) {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : undefined;
}

export function windowLabel(windowSeconds?: number, fallback?: string, language: Language = "ko") {
  const t = getTranslations(language);
  const resolvedFallback = fallback ?? t.usage.limitFallback;
  if (!windowSeconds) {
    return resolvedFallback;
  }

  if (windowSeconds >= 6 * 24 * 60 * 60) {
    return t.usage.weeklyLimit;
  }
  if (windowSeconds >= 24 * 60 * 60) {
    return t.usage.dayLimit(Math.round(windowSeconds / 86_400));
  }
  if (windowSeconds >= 60 * 60) {
    return t.usage.hourLimit(Math.round(windowSeconds / 3_600));
  }
  return t.usage.minuteLimit(Math.round(windowSeconds / 60));
}

function createWindow(input: UsageWindowInput, language: Language): UsageLimitWindow {
  return {
    ...input,
    percent: clampPercent(input.percent),
    available: input.available ?? true,
    quality: input.quality ?? "exact",
    resetRemaining: formatRemaining(input.resetsAt, language)
  };
}

function createMissingWindow(id: "primary" | "weekly", label: string, language: Language): UsageLimitWindow {
  return {
    id,
    label,
    percent: 0,
    available: false,
    quality: "unavailable",
    message: getTranslations(language).usage.notProvided
  };
}

function isPrimaryWeeklyDuration(window?: UsageLimitWindow) {
  return typeof window?.windowDurationMinutes === "number" && window.windowDurationMinutes >= 6 * 24 * 60;
}

function ensureLimitWindows(windows: UsageLimitWindow[], language: Language): UsageLimitWindow[] {
  const t = getTranslations(language);
  const primary = windows.find((window) => window.id === "primary");
  const weekly = windows.find((window) => window.id === "weekly");
  if (!primary && !weekly) {
    return [createMissingWindow("primary", t.usage.limitFallback, language), createMissingWindow("weekly", t.usage.weeklyLimit, language)];
  }
  if (isPrimaryWeeklyDuration(primary) && !weekly) {
    return [primary as UsageLimitWindow];
  }
  return [primary ?? createMissingWindow("primary", t.usage.limitFallback, language), weekly ?? createMissingWindow("weekly", t.usage.weeklyLimit, language)];
}

function shouldCacheUsage(usage: UsageResult) {
  return usage.status !== "signed-out" && usage.status !== "error";
}

function rememberUsage(provider: ProviderId, usage: UsageResult) {
  if (shouldCacheUsage(usage)) {
    lastSuccessfulUsage.set(provider, usage);
  }
  return usage;
}

function readLastSuccessfulUsage(provider: ProviderId) {
  const usage = lastSuccessfulUsage.get(provider);
  if (!usage) {
    return null;
  }
  if (usage.resetsAt && new Date(usage.resetsAt).getTime() <= Date.now()) {
    lastSuccessfulUsage.delete(provider);
    return null;
  }
  return usage;
}

function isUsageWindow(window: UsageLimitWindow | null): window is UsageLimitWindow {
  return Boolean(window);
}

function seededUsage(provider: ProviderId, credential: string | undefined, language: Language) {
  const t = getTranslations(language);
  if (!credential) {
    return {
      used: 0,
      limit: 0,
      unit: "requests" as const,
      percent: 0,
      status: "signed-out" as const,
      message: provider === "claude" ? t.usage.claudeLoginHint : t.usage.signInRequired
    };
  }

  const seed = Array.from(`${provider}:${credential}:${new Date().getMinutes()}`).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0
  );
  const limit = provider === "gemini" ? 1_500 : provider === "claude" ? 1_000 : 500;
  const used = Math.min(limit, Math.round(limit * (0.25 + (seed % 70) / 100)));
  const percent = Math.round((used / limit) * 100);

  return {
    used,
    limit,
    unit: "requests" as const,
    percent,
    status: getStatus(percent),
    source: "token" as const,
    connectionStatus: "connected" as const,
    dataUpdatedAt: new Date().toISOString(),
    windows: provider === "gemini" ? [
      createWindow({
        id: "daily",
        label: t.usage.today,
        percent: Math.max(0, percent - 12),
        resetsAt: nextLocalMidnight().toISOString(),
        quality: "estimated",
        windowDurationMinutes: 24 * 60,
        message: t.usage.tokenEstimate
      }, language)
    ] : [
      createWindow({
        id: "primary",
        label: t.usage.hourLimit(5),
        percent,
        resetsAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        quality: "estimated",
        windowDurationMinutes: 5 * 60
      }, language),
      createWindow({
        id: "weekly",
        label: t.usage.weeklyLimit,
        percent: Math.max(0, percent - 20),
        resetsAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
        quality: "estimated",
        windowDurationMinutes: 7 * 24 * 60,
        message: t.usage.tokenEstimate
      }, language)
    ]
  };
}

function nextLocalMidnight() {
  const next = new Date();
  next.setHours(24, 0, 0, 0);
  return next;
}

function listFilesRecursive(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listFilesRecursive(entryPath);
    }
    return entry.isFile() ? [entryPath] : [];
  });
}

function readFileTail(file: string, maxBytes = CODEX_SESSION_TAIL_BYTES) {
  const size = statSync(file).size;
  const length = Math.min(size, maxBytes);
  const offset = Math.max(0, size - length);
  const buffer = Buffer.alloc(length);
  const descriptor = openSync(file, "r");
  try {
    readSync(descriptor, buffer, 0, length, offset);
  } finally {
    closeSync(descriptor);
  }

  const text = buffer.toString("utf8");
  if (offset === 0) {
    return text;
  }
  const firstLineBreak = text.indexOf("\n");
  return firstLineBreak >= 0 ? text.slice(firstLineBreak + 1) : "";
}

function readLatestCodexUsage(language: Language) {
  const now = Date.now();
  if (now < codexLocalCache.nextScanAt) {
    return codexLocalCache.usage;
  }
  codexLocalCache = { nextScanAt: now + CODEX_LOCAL_SCAN_INTERVAL_MS, usage: null };
  const sessionDir = path.join(codexConfigDirectory(), "sessions");
  const files = listFilesRecursive(sessionDir)
    .filter((file) => file.endsWith(".jsonl"))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .slice(0, 10);

  for (const file of files) {
    let lines: string[];
    try {
      lines = readFileTail(file).trim().split("\n").reverse();
    } catch {
      continue;
    }
    for (const line of lines) {
      try {
        const record = JSON.parse(line) as {
          timestamp?: string;
          payload?: {
            rate_limits?: {
              primary?: {
                used_percent?: number;
                resets_at?: number;
                resets_in_seconds?: number;
                window_minutes?: number;
              };
              secondary?: {
                used_percent?: number;
                resets_at?: number;
                resets_in_seconds?: number;
                window_minutes?: number;
              };
              plan_type?: string;
            };
          };
        };
        const rateLimit = record.payload?.rate_limits;
        const primary = rateLimit?.primary;
        const secondary = rateLimit?.secondary;
        const mainWindow = primary ?? secondary;
        if (!mainWindow || typeof mainWindow.used_percent !== "number") {
          continue;
        }

        const resetsAt =
          typeof mainWindow.resets_at === "number"
            ? new Date(mainWindow.resets_at * 1000).toISOString()
            : typeof mainWindow.resets_in_seconds === "number"
              ? new Date(Date.now() + mainWindow.resets_in_seconds * 1000).toISOString()
              : undefined;
        if (resetsAt && Date.parse(resetsAt) <= Date.now()) {
          continue;
        }
        const percent = clampPercent(mainWindow.used_percent);
        const dataUpdatedAt = record.timestamp && !Number.isNaN(Date.parse(record.timestamp))
          ? new Date(record.timestamp).toISOString()
          : new Date(statSync(file).mtimeMs).toISOString();
        if (now - Date.parse(dataUpdatedAt) > CODEX_LOCAL_FRESHNESS_MS) {
          continue;
        }
        const windows = [
          primary && typeof primary.used_percent === "number"
            ? createWindow({
                id: "primary",
                label: windowLabel(
                  typeof primary.window_minutes === "number" ? primary.window_minutes * 60 : undefined,
                  undefined,
                  language
                ),
                percent: primary.used_percent,
                dataUpdatedAt,
                windowDurationMinutes: primary.window_minutes,
                resetsAt:
                  unixSecondsToIso(primary.resets_at) ??
                  (typeof primary.resets_in_seconds === "number"
                    ? new Date(Date.now() + primary.resets_in_seconds * 1000).toISOString()
                    : undefined)
              }, language)
            : null,
          secondary && typeof secondary.used_percent === "number"
            ? createWindow({
                id: "weekly",
                label: windowLabel(
                  typeof secondary.window_minutes === "number" ? secondary.window_minutes * 60 : undefined,
                  getTranslations(language).usage.weeklyLimit,
                  language
                ),
                percent: secondary.used_percent,
                dataUpdatedAt,
                windowDurationMinutes: secondary.window_minutes,
                resetsAt:
                  unixSecondsToIso(secondary.resets_at) ??
                  (typeof secondary.resets_in_seconds === "number"
                    ? new Date(Date.now() + secondary.resets_in_seconds * 1000).toISOString()
                    : undefined)
              }, language)
            : null
        ].filter(isUsageWindow);
        const usage = withReset({
          used: percent,
          limit: 100,
          unit: "credits" as const,
          percent,
          status: getStatus(percent),
          resetsAt,
          source: "local" as const,
          connectionStatus: "connected" as const,
          dataUpdatedAt,
          windows: ensureLimitWindows(windows, language),
          message: rateLimit?.plan_type
        }, language);
        codexLocalCache.usage = usage;
        return usage;
      } catch {
        continue;
      }
    }
  }

  return codexLocalCache.usage;
}

function readCodexAccessToken() {
  const authPath = path.join(codexConfigDirectory(), "auth.json");
  if (!existsSync(authPath)) {
    return null;
  }

  try {
    const auth = JSON.parse(readFileSync(authPath, "utf8")) as { tokens?: { access_token?: string } };
    return auth.tokens?.access_token ?? null;
  } catch {
    return null;
  }
}

function decodeJwtEmail(token?: string): string | undefined {
  if (!token) {
    return undefined;
  }
  const payload = token.split(".")[1];
  if (!payload) {
    return undefined;
  }
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(normalized, "base64").toString("utf8");
    const claims = JSON.parse(json) as { email?: string };
    return typeof claims.email === "string" ? claims.email : undefined;
  } catch {
    return undefined;
  }
}

function readCodexAccountEmail(): string | undefined {
  const authPath = path.join(codexConfigDirectory(), "auth.json");
  if (!existsSync(authPath)) {
    return undefined;
  }

  try {
    const auth = JSON.parse(readFileSync(authPath, "utf8")) as { tokens?: { id_token?: string } };
    return decodeJwtEmail(auth.tokens?.id_token);
  } catch {
    return undefined;
  }
}

function readClaudeAccountEmail(): string | undefined {
  const configPath = path.join(homedir(), ".claude.json");
  if (!existsSync(configPath)) {
    return undefined;
  }

  try {
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      oauthAccount?: { emailAddress?: string };
    };
    return config.oauthAccount?.emailAddress;
  } catch {
    return undefined;
  }
}

function readGeminiAccountEmail(): string | undefined {
  const credentialsPath = path.join(homedir(), ".gemini", "oauth_creds.json");
  if (!existsSync(credentialsPath)) {
    return undefined;
  }

  try {
    const credentials = JSON.parse(readFileSync(credentialsPath, "utf8")) as { id_token?: string };
    return decodeJwtEmail(credentials.id_token);
  } catch {
    return undefined;
  }
}

function readAccountEmail(provider: ProviderId): string | undefined {
  if (!isLocalProviderDetectionEnabled()) {
    return undefined;
  }
  if (provider === "codex") {
    return readCodexAccountEmail();
  }
  if (provider === "claude") {
    return readClaudeAccountEmail();
  }
  if (provider === "gemini") {
    return readGeminiAccountEmail();
  }
  return undefined;
}

async function fetchCodexUsage(savedAccessToken: string | undefined, language: Language) {
  const accessToken = savedAccessToken ?? readCodexAccessToken();
  if (!accessToken) {
    return null;
  }

  const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
    signal: globalThis.AbortSignal.timeout(CODEX_REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new CodexUsageApiError(response.status, parseRetryAfterMs(response.headers.get("retry-after")), language);
  }

  const data = (await response.json()) as {
    plan_type?: string;
    rate_limit?: {
      primary_window?: { used_percent?: number; reset_at?: number; limit_window_seconds?: number };
      secondary_window?: { used_percent?: number; reset_at?: number; limit_window_seconds?: number };
    };
  };
  const primary = data.rate_limit?.primary_window;
  const weekly = data.rate_limit?.secondary_window;
  const mainWindow = primary ?? weekly;
  if (!mainWindow || typeof mainWindow.used_percent !== "number") {
    return null;
  }

  const percent = clampPercent(mainWindow.used_percent);
  const resetsAt = unixSecondsToIso(mainWindow.reset_at);
  const dataUpdatedAt = new Date().toISOString();
  const t = getTranslations(language);
  const windows = ensureLimitWindows([
    primary && typeof primary.used_percent === "number"
      ? createWindow({
          id: "primary",
          label: windowLabel(primary.limit_window_seconds, t.usage.limitFallback, language),
          percent: primary.used_percent,
          dataUpdatedAt,
          windowDurationMinutes: typeof primary.limit_window_seconds === "number"
            ? primary.limit_window_seconds / 60
            : undefined,
          resetsAt: unixSecondsToIso(primary.reset_at)
        }, language)
      : null,
    weekly && typeof weekly.used_percent === "number"
      ? createWindow({
          id: "weekly",
          label: windowLabel(weekly.limit_window_seconds, t.usage.weeklyLimit, language),
          percent: weekly.used_percent,
          dataUpdatedAt,
          windowDurationMinutes: typeof weekly.limit_window_seconds === "number"
            ? weekly.limit_window_seconds / 60
            : undefined,
          resetsAt: unixSecondsToIso(weekly.reset_at)
        }, language)
      : null
  ].filter(isUsageWindow), language);

  return withReset({
    used: percent,
    limit: 100,
    unit: "credits" as const,
    percent,
    status: getStatus(percent),
    resetsAt,
    source: "api" as const,
    connectionStatus: "connected" as const,
    dataUpdatedAt,
    windows,
    message: data.plan_type
  }, language);
}

function codexFailureUsage(error: Error, hasSession: boolean, language: Language): UsageResult | null {
  if (!hasSession) {
    return null;
  }
  const t = getTranslations(language);

  const authExpired = error instanceof CodexUsageApiError && (error.status === 401 || error.status === 403);
  if (authExpired) {
    lastSuccessfulUsage.delete("codex");
    return {
      used: 0,
      limit: 0,
      unit: "credits",
      percent: 0,
      status: "signed-out",
      source: "api",
      connectionStatus: "signed-out",
      message: t.usage.codexSessionExpired
    };
  }

  const retryAt = new Date(codexNextAttemptAt).toISOString();
  const cached = readLastSuccessfulUsage("codex");
  const message = t.usage.codexRetryMessage(formatRemaining(retryAt, language) ?? t.usage.shortly);
  return cached
    ? {
        ...cached,
        stale: true,
        connectionStatus: "connected",
        freshness: {
          observedAt: cached.dataUpdatedAt,
          receivedAt: new Date().toISOString(),
          retryAt,
          staleReason: error.message
        },
        message
      }
    : {
        used: 0,
        limit: 0,
        unit: "credits",
        percent: 0,
        status: "error",
        source: "api",
        connectionStatus: "connected",
        stale: true,
        freshness: {
          receivedAt: new Date().toISOString(),
          retryAt,
          staleReason: error.message
        },
        message
      };
}

async function fetchThrottledCodexUsage(savedAccessToken: string | undefined, language: Language): Promise<UsageResult | null> {
  const accessToken = savedAccessToken ?? readCodexAccessToken() ?? undefined;
  const fingerprint = accessToken ? createResetTrackingId(accessToken) : null;
  if (fingerprint !== codexSessionFingerprint) {
    const identityChanged = codexSessionFingerprint !== null;
    codexSessionFingerprint = fingerprint;
    codexNextAttemptAt = 0;
    codexLastError = null;
    codexLocalCache = { nextScanAt: 0, usage: null };
    if (identityChanged) {
      lastSuccessfulUsage.delete("codex");
    }
  }

  const local = savedAccessToken ? null : readLatestCodexUsage(language);
  if (local) {
    codexLastError = null;
    return rememberUsage("codex", {
      ...local,
      resetTrackingId: fingerprint ?? undefined
    });
  }

  const hasSession = Boolean(accessToken);
  if (codexInFlight) {
    return codexInFlight;
  }
  if (Date.now() < codexNextAttemptAt) {
    if (codexLastError) {
      return codexFailureUsage(codexLastError, hasSession, language);
    }
    return readLastSuccessfulUsage("codex");
  }

  codexNextAttemptAt = Date.now() + CODEX_MIN_REFRESH_MS;
  codexInFlight = (async () => {
    try {
      const usage = await fetchCodexUsage(accessToken, language);
      codexLastError = null;
      return usage
        ? rememberUsage("codex", { ...usage, resetTrackingId: fingerprint ?? undefined })
        : null;
    } catch (error) {
      codexLastError = error instanceof Error ? error : new Error(getTranslations(language).usage.codexFetchFailedGeneric);
      const retryAfterMs = codexLastError instanceof CodexUsageApiError ? codexLastError.retryAfterMs : undefined;
      codexNextAttemptAt = Date.now() + Math.max(CODEX_MIN_REFRESH_MS, retryAfterMs ?? 0);
      return codexFailureUsage(codexLastError, hasSession, language);
    } finally {
      codexInFlight = null;
    }
  })();
  return codexInFlight;
}

function createResetTrackingId(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function hasUsableRefreshCredential(refreshToken?: string, expiresAt?: number | string) {
  if (!refreshToken) {
    return false;
  }
  if (expiresAt === undefined) {
    return true;
  }

  const numeric = typeof expiresAt === "number" ? expiresAt : Number(expiresAt);
  const expiryMs = Number.isFinite(numeric)
    ? numeric < 10_000_000_000 ? numeric * 1_000 : numeric
    : Date.parse(String(expiresAt));
  return Number.isFinite(expiryMs) && expiryMs > Date.now();
}

function readClaudeSession(): ClaudeSession | null {
  const credentialsPath = path.join(claudeConfigDirectory(), ".credentials.json");
  if (existsSync(credentialsPath)) {
    try {
      const credentials = JSON.parse(readFileSync(credentialsPath, "utf8")) as {
        accessToken?: string;
        refreshToken?: string;
        refreshTokenExpiresAt?: number | string;
        organizationUuid?: string;
        claudeAiOauth?: {
          accessToken?: string;
          refreshToken?: string;
          refreshTokenExpiresAt?: number | string;
        };
      };
      const token = credentials.claudeAiOauth?.accessToken ?? credentials.accessToken;
      const refreshToken = credentials.claudeAiOauth?.refreshToken ?? credentials.refreshToken;
      const refreshTokenExpiresAt = credentials.claudeAiOauth?.refreshTokenExpiresAt ?? credentials.refreshTokenExpiresAt;
      if (token) {
        return {
          accessToken: token,
          resetTrackingId: createResetTrackingId(credentials.organizationUuid ?? refreshToken ?? token),
          hasRefreshCredential: hasUsableRefreshCredential(refreshToken, refreshTokenExpiresAt),
          refreshToken
        };
      }
    } catch {
      // Continue to Keychain fallback.
    }
  }

  const keychainCredential = platformAdapter.readClaudeKeychainCredential();
  return keychainCredential
    ? {
        accessToken: keychainCredential.accessToken,
        resetTrackingId: createResetTrackingId(
          keychainCredential.organizationUuid ??
          keychainCredential.refreshToken ??
          keychainCredential.accessToken
        ),
        hasRefreshCredential: hasUsableRefreshCredential(
          keychainCredential.refreshToken,
          keychainCredential.refreshTokenExpiresAt
        ),
        refreshToken: keychainCredential.refreshToken
      }
    : null;
}

export function parseRetryAfterMs(value: string | null, now = Date.now()) {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }

  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) {
    return undefined;
  }

  return Math.max(0, retryAt - now);
}

async function fetchClaudeUsage(accessToken: string, language: Language): Promise<UsageResult> {
  const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
    signal: globalThis.AbortSignal.timeout(CLAUDE_REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "anthropic-beta": "oauth-2025-04-20",
      "User-Agent": "claude-code/2.1.121"
    }
  });

  if (!response.ok) {
    throw new ClaudeUsageApiError(
      response.status,
      parseRetryAfterMs(response.headers.get("retry-after")),
      language
    );
  }

  const data = (await response.json()) as {
    five_hour?: { utilization?: number; resets_at?: string };
    seven_day?: { utilization?: number; resets_at?: string };
  };
  const window = data.five_hour ?? data.seven_day;
  if (!window || typeof window.utilization !== "number") {
    throw new Error(getTranslations(language).usage.claudeApiNoUsageInfo);
  }

  const t = getTranslations(language);
  const percent = Math.round(window.utilization);
  return withReset({
    used: percent,
    limit: 100,
    unit: "credits" as const,
    percent,
    status: getStatus(percent),
    resetsAt: window.resets_at,
    source: "api" as const,
    connectionStatus: "connected" as const,
    dataUpdatedAt: new Date().toISOString(),
    windows: ensureLimitWindows([
      data.five_hour && typeof data.five_hour.utilization === "number"
        ? createWindow({
            id: "primary",
            label: t.usage.hourLimit(5),
            percent: data.five_hour.utilization,
            resetsAt: data.five_hour.resets_at,
            dataUpdatedAt: new Date().toISOString(),
            windowDurationMinutes: 5 * 60
          }, language)
        : null,
      data.seven_day && typeof data.seven_day.utilization === "number"
        ? createWindow({
            id: "weekly",
            label: t.usage.weeklyLimit,
            percent: data.seven_day.utilization,
            resetsAt: data.seven_day.resets_at,
            dataUpdatedAt: new Date().toISOString(),
            windowDurationMinutes: 7 * 24 * 60
          }, language)
        : null
    ].filter(isUsageWindow), language),
    message: undefined
  }, language);
}

function resetClaudeRequestState(
  accessToken: string | null,
  resetTrackingId: string | null,
  hasRefreshCredential = false
) {
  if (
    claudeRequestState.accessToken === accessToken &&
    claudeRequestState.resetTrackingId === resetTrackingId &&
    claudeRequestState.hasRefreshCredential === hasRefreshCredential
  ) {
    return claudeRequestState;
  }

  const identityChanged = claudeRequestState.resetTrackingId !== resetTrackingId;
  claudeRequestState = createClaudeRequestState(accessToken, resetTrackingId, hasRefreshCredential);
  if (identityChanged) {
    lastSuccessfulUsage.delete("claude");
  }
  return claudeRequestState;
}

function claudeFailureDelay(error: Error, state: ClaudeRequestState) {
  const exponentialBackoff = Math.min(
    CLAUDE_MIN_REFRESH_MS * 2 ** Math.max(0, state.failureCount - 1),
    CLAUDE_MAX_BACKOFF_MS
  );
  const retryAfterMs = error instanceof ClaudeUsageApiError ? error.retryAfterMs : undefined;
  return Math.max(CLAUDE_MIN_REFRESH_MS, exponentialBackoff, retryAfterMs ?? 0);
}

function claudeFailureMessage(error: Error, state: ClaudeRequestState, language: Language) {
  const t = getTranslations(language);
  if (error instanceof ClaudeUsageApiError && error.status === 401 && state.hasRefreshCredential) {
    return t.usage.claudeWaitingRefresh;
  }
  if (error instanceof ClaudeUsageApiError && (error.status === 401 || error.status === 403)) {
    return t.usage.claudeSessionExpired;
  }

  const retrySeconds = Math.max(1, Math.ceil((state.nextAttemptAt - Date.now()) / 1_000));
  if (error instanceof ClaudeUsageApiError && error.status === 429) {
    return t.usage.claudeRateLimited(retrySeconds);
  }
  return t.usage.claudeFetchFailed(retrySeconds);
}

function claudeFailureUsage(error: Error, state: ClaudeRequestState, language: Language): UsageResult {
  const authExpired = error instanceof ClaudeUsageApiError &&
    (error.status === 403 || (error.status === 401 && !state.hasRefreshCredential));
  return {
    used: 0,
    limit: 0,
    unit: "requests",
    percent: 0,
    status: authExpired ? "signed-out" : "error",
    source: "api",
    connectionStatus: authExpired ? "signed-out" : "connected",
    stale: !authExpired,
    freshness: {
      receivedAt: new Date().toISOString(),
      retryAt: authExpired ? undefined : new Date(state.nextAttemptAt).toISOString(),
      staleReason: authExpired ? undefined : error.message
    },
    resetTrackingId: state.resetTrackingId ?? undefined,
    message: claudeFailureMessage(error, state, language)
  };
}

function claudeCachedOrFailure(error: Error, state: ClaudeRequestState, language: Language) {
  const authExpired = error instanceof ClaudeUsageApiError &&
    (error.status === 403 || (error.status === 401 && !state.hasRefreshCredential));
  if (authExpired) {
    lastSuccessfulUsage.delete("claude");
    return claudeFailureUsage(error, state, language);
  }

  const cached = readLastSuccessfulUsage("claude");
  return cached
    ? {
        ...cached,
        connectionStatus: "connected" as const,
        stale: true,
        freshness: {
          observedAt: cached.dataUpdatedAt,
          receivedAt: new Date().toISOString(),
          retryAt: new Date(state.nextAttemptAt).toISOString(),
          staleReason: error.message
        },
        message: claudeFailureMessage(error, state, language)
      }
    : claudeFailureUsage(error, state, language);
}

async function refreshClaudeAccessToken(refreshToken: string): Promise<ClaudeTokenRefreshOutcome> {
  try {
    const response = await fetch(CLAUDE_OAUTH_TOKEN_URL, {
      method: "POST",
      signal: globalThis.AbortSignal.timeout(CLAUDE_REQUEST_TIMEOUT_MS),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CLAUDE_OAUTH_CLIENT_ID
      })
    });

    if (response.status === 400) {
      return { status: "invalid" };
    }
    if (!response.ok) {
      return { status: "error" };
    }

    const data = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) {
      return { status: "error" };
    }
    return {
      status: "ok",
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1_000 : undefined
    };
  } catch {
    return { status: "error" };
  }
}

function claudeSessionWithRefreshOverride(session: ClaudeSession): ClaudeSession {
  if (
    claudeRefreshedCredential &&
    claudeRefreshedCredential.resetTrackingId === session.resetTrackingId &&
    claudeRefreshedCredential.expiresAt > Date.now()
  ) {
    return {
      ...session,
      accessToken: claudeRefreshedCredential.accessToken,
      refreshToken: claudeRefreshedCredential.refreshToken,
      hasRefreshCredential: true
    };
  }
  return session;
}

async function tryRecoverWithClaudeRefresh(
  error: unknown,
  session: ClaudeSession,
  state: ClaudeRequestState,
  language: Language
): Promise<UsageResult | null> {
  if (!(error instanceof ClaudeUsageApiError) || error.status !== 401 || !session.refreshToken || !state.hasRefreshCredential) {
    return null;
  }
  if (session.refreshToken === claudeInvalidRefreshToken) {
    state.hasRefreshCredential = false;
    return null;
  }

  const outcome = await refreshClaudeAccessToken(session.refreshToken);
  if (outcome.status === "invalid") {
    claudeInvalidRefreshToken = session.refreshToken;
    if (claudeRefreshedCredential?.resetTrackingId === session.resetTrackingId) {
      claudeRefreshedCredential = null;
    }
    state.hasRefreshCredential = false;
    return null;
  }
  if (outcome.status !== "ok") {
    return null;
  }

  claudeRefreshedCredential = {
    resetTrackingId: session.resetTrackingId,
    accessToken: outcome.accessToken,
    refreshToken: outcome.refreshToken,
    expiresAt: outcome.expiresAt ?? Date.now() + CLAUDE_REFRESH_FALLBACK_TTL_MS
  };

  try {
    const usage = {
      ...(await fetchClaudeUsage(outcome.accessToken, language)),
      resetTrackingId: session.resetTrackingId
    };
    state.failureCount = 0;
    state.lastError = null;
    return usage;
  } catch {
    return null;
  }
}

async function fetchThrottledClaudeUsage(rawSession: ClaudeSession, language: Language): Promise<UsageResult> {
  const session = claudeSessionWithRefreshOverride(rawSession);
  const state = resetClaudeRequestState(
    session.accessToken,
    session.resetTrackingId,
    session.hasRefreshCredential
  );

  if (state.inFlight) {
    return state.inFlight;
  }

  if (Date.now() < state.nextAttemptAt) {
    const cached = readLastSuccessfulUsage("claude");
    if (!state.lastError) {
      return cached ?? claudeFailureUsage(new Error(getTranslations(language).usage.claudeLoadingPlaceholder), state, language);
    }
    return claudeCachedOrFailure(state.lastError, state, language);
  }

  const requestStartedAt = Date.now();
  state.nextAttemptAt = requestStartedAt + CLAUDE_MIN_REFRESH_MS;
  const request = (async () => {
    try {
      const usage = {
        ...(await fetchClaudeUsage(session.accessToken, language)),
        resetTrackingId: session.resetTrackingId
      };
      state.failureCount = 0;
      state.lastError = null;
      return claudeRequestState === state ? rememberUsage("claude", usage) : usage;
    } catch (error) {
      const recovered = await tryRecoverWithClaudeRefresh(error, session, state, language);
      if (recovered) {
        return claudeRequestState === state ? rememberUsage("claude", recovered) : recovered;
      }

      const normalizedError = error instanceof Error ? error : new Error(getTranslations(language).usage.claudeFetchFailedGeneric);
      state.failureCount += 1;
      state.lastError = normalizedError;
      state.nextAttemptAt = Date.now() + claudeFailureDelay(normalizedError, state);
      return claudeRequestState === state
        ? claudeCachedOrFailure(normalizedError, state, language)
        : claudeFailureUsage(normalizedError, state, language);
    } finally {
      state.inFlight = null;
    }
  })();
  state.inFlight = request;
  return request;
}

function readGeminiLocalSession(language: Language) {
  const credentialsPath = path.join(homedir(), ".gemini", "oauth_creds.json");
  if (!existsSync(credentialsPath)) {
    return null;
  }
  const t = getTranslations(language);

  return withReset({
    used: 0,
    limit: 100,
    unit: "credits" as const,
    percent: 0,
    status: "ok" as const,
    source: "local" as const,
    connectionStatus: "connected" as const,
    windows: [
      createWindow({
        id: "daily",
        label: t.usage.today,
        percent: 0,
        resetsAt: nextLocalMidnight().toISOString(),
        available: false,
        quality: "unavailable",
        message: t.usage.geminiOAuthSessionDetected
      }, language)
    ],
    message: t.usage.geminiApiPending
  }, language);
}

function geminiOAuthUsage(language: Language) {
  const t = getTranslations(language);
  return withReset({
    used: 0,
    limit: 100,
    unit: "credits" as const,
    percent: 0,
    status: "ok" as const,
    source: "api" as const,
    connectionStatus: "connected" as const,
    windows: [
      createWindow({
        id: "daily",
        label: t.usage.today,
        percent: 0,
        resetsAt: nextLocalMidnight().toISOString(),
        available: false,
        quality: "unavailable",
        message: t.usage.googleOAuthConnected
      }, language)
    ],
    message: t.usage.geminiApiPending
  }, language);
}

const adapters: ProviderAdapter[] = PROVIDERS.map((provider) => ({
  ...provider,
  fetchUsage: async (auth: ProviderAuth | undefined, language: Language) => {
    const credential = auth?.accessToken;
    if (provider.id === "codex") {
      const codexUsage = isLocalProviderDetectionEnabled()
        ? await fetchThrottledCodexUsage(credential, language)
        : null;
      return codexUsage ?? readLastSuccessfulUsage(provider.id) ?? seededUsage(provider.id, credential, language);
    }
    if (provider.id === "claude") {
      const savedOAuthSession = auth?.type === "oauth" && credential
        ? {
            accessToken: credential,
            resetTrackingId: createResetTrackingId(auth.accountLabel ?? auth.refreshToken ?? credential),
            hasRefreshCredential: Boolean(auth.refreshToken),
            refreshToken: auth.refreshToken
          }
        : null;
      const session = savedOAuthSession ?? (isLocalProviderDetectionEnabled() ? readClaudeSession() : null);
      if (!session) {
        resetClaudeRequestState(null, null);
        return {
          ...seededUsage(provider.id, undefined, language),
          connectionStatus: "signed-out" as const
        };
      }
      return fetchThrottledClaudeUsage(session, language);
    }
    if (provider.id === "gemini") {
      return (
        (isLocalProviderDetectionEnabled() ? readGeminiLocalSession(language) : null) ??
        (auth?.type === "oauth" ? geminiOAuthUsage(language) : seededUsage(provider.id, undefined, language))
      );
    }
    return seededUsage(provider.id, credential, language);
  }
}));

function sourceInfo(result: UsageResult, providerLabel: string, language: Language) {
  const t = getTranslations(language);
  if (!result.source) {
    return undefined;
  }
  if (result.stale) {
    return { label: t.usage.lastGoodData(providerLabel), mode: "cache" as const };
  }
  if (result.source === "local") {
    return { label: t.usage.localSession(providerLabel), mode: "local" as const };
  }
  if (result.source === "api") {
    return { label: t.usage.usageApi(providerLabel), mode: "poll" as const };
  }
  if (result.source === "token") {
    return { label: t.usage.tokenBasedEstimate, mode: "estimate" as const };
  }
  return { label: t.usage.demoData, mode: "estimate" as const };
}

export async function fetchUsageSnapshot(settings: AppSettings): Promise<ProviderUsage[]> {
  const language: Language = settings.language ?? "ko";
  const visibleAdapters = adapters.filter((adapter) => settings.providers[adapter.id].visible);

  return Promise.all(
    visibleAdapters.map(async (adapter) => {
      try {
        const providerSettings = settings.providers[adapter.id];
        const result = await adapter.fetchUsage(providerSettings.auth, language);
        const receivedAt = new Date().toISOString();
        const observedAt = result.dataUpdatedAt;
        const accountLabel = result.connectionStatus === "connected"
          ? result.accountLabel ?? providerSettings.auth?.accountLabel ?? (
              providerSettings.auth ? undefined : readAccountEmail(adapter.id)
            )
          : undefined;
        return {
          provider: adapter.id,
          label: adapter.label,
          updatedAt: receivedAt,
          ...result,
          accountLabel,
          sourceInfo: result.sourceInfo ?? sourceInfo(result, adapter.label, language),
          freshness: {
            observedAt,
            receivedAt,
            ...(result.freshness ?? {})
          },
          windows: result.windows?.map((window) => ({
            ...window,
            available: window.available ?? true,
            quality: window.quality ?? (result.source === "token" ? "estimated" : "exact"),
            dataUpdatedAt: window.dataUpdatedAt ?? observedAt
          }))
        };
      } catch (error) {
        return {
          provider: adapter.id,
          label: adapter.label,
          used: 0,
          limit: 0,
          unit: "requests",
          percent: 0,
          status: "error",
          updatedAt: new Date().toISOString(),
          message: error instanceof Error ? error.message : getTranslations(language).usage.fetchFailedGeneric
        };
      }
    })
  );
}
