import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { AppSettings, ProviderAuth, ProviderId, ProviderUsage, PROVIDERS, UsageLimitWindow } from "../shared/types.js";

type ProviderAdapter = {
  id: ProviderId;
  label: string;
  fetchUsage: (auth?: ProviderAuth) => Promise<Omit<ProviderUsage, "provider" | "label" | "updatedAt">>;
};

type UsageWindowInput = {
  id: "primary" | "daily" | "weekly";
  label: string;
  percent: number;
  resetsAt?: string;
  message?: string;
};

function formatRemaining(resetsAt?: string) {
  if (!resetsAt) {
    return undefined;
  }

  const diffMs = new Date(resetsAt).getTime() - Date.now();
  if (Number.isNaN(diffMs)) {
    return undefined;
  }
  if (diffMs <= 0) {
    return "초기화 중";
  }

  const minutes = Math.ceil(diffMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return hours > 0 ? `${hours}시간 ${restMinutes}분` : `${restMinutes}분`;
}

function withReset<T extends Omit<ProviderUsage, "provider" | "label" | "updatedAt">>(usage: T): T {
  return {
    ...usage,
    resetRemaining: usage.resetRemaining ?? formatRemaining(usage.resetsAt),
    windows: usage.windows?.map((window) => ({
      ...window,
      resetRemaining: window.resetRemaining ?? formatRemaining(window.resetsAt)
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

function createWindow(input: UsageWindowInput): UsageLimitWindow {
  return {
    ...input,
    percent: clampPercent(input.percent),
    resetRemaining: formatRemaining(input.resetsAt)
  };
}

function createMissingWindow(id: "primary" | "weekly", label: string): UsageLimitWindow {
  return {
    id,
    label,
    percent: 0,
    message: "데이터 없음"
  };
}

function ensureLimitWindows(windows: UsageLimitWindow[]): UsageLimitWindow[] {
  const primary = windows.find((window) => window.id === "primary") ?? createMissingWindow("primary", "5시간 한도");
  const weekly = windows.find((window) => window.id === "weekly") ?? createMissingWindow("weekly", "주간 한도");
  return [primary, weekly];
}

function isUsageWindow(window: UsageLimitWindow | null): window is UsageLimitWindow {
  return Boolean(window);
}

function seededUsage(provider: ProviderId, credential?: string) {
  if (!credential) {
    return {
      used: 0,
      limit: 0,
      unit: "requests" as const,
      percent: 0,
      status: "signed-out" as const,
      message: provider === "claude" ? "터미널에서 claude /login을 먼저 실행하세요." : "로그인이 필요합니다."
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
    windows: provider === "gemini" ? [
      createWindow({
        id: "daily",
        label: "오늘",
        percent: Math.max(0, percent - 12),
        resetsAt: nextLocalMidnight().toISOString(),
        message: "토큰 기반 추정"
      })
    ] : [
      createWindow({
        id: "primary",
        label: "5시간 한도",
        percent,
        resetsAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
      }),
      createWindow({
        id: "weekly",
        label: "주간 한도",
        percent: Math.max(0, percent - 20),
        resetsAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
        message: "토큰 기반 추정"
      })
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

function readLatestCodexUsage() {
  const sessionDir = path.join(homedir(), ".codex", "sessions");
  const files = listFilesRecursive(sessionDir)
    .filter((file) => file.endsWith(".jsonl"))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .slice(0, 20);

  for (const file of files) {
    const lines = readFileSync(file, "utf8").trim().split("\n").reverse();
    for (const line of lines) {
      try {
        const record = JSON.parse(line) as {
          timestamp?: string;
          payload?: {
            rate_limits?: {
              primary?: { used_percent?: number; resets_at?: number; resets_in_seconds?: number };
              secondary?: { used_percent?: number; resets_at?: number; resets_in_seconds?: number };
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
        const percent = clampPercent(mainWindow.used_percent);
        const windows = [
          primary && typeof primary.used_percent === "number"
            ? createWindow({
                id: "primary",
                label: "5시간 한도",
                percent: primary.used_percent,
                resetsAt:
                  unixSecondsToIso(primary.resets_at) ??
                  (typeof primary.resets_in_seconds === "number"
                    ? new Date(Date.now() + primary.resets_in_seconds * 1000).toISOString()
                    : undefined)
              })
            : null,
          secondary && typeof secondary.used_percent === "number"
            ? createWindow({
                id: "weekly",
                label: "주간 한도",
                percent: secondary.used_percent,
                resetsAt:
                  unixSecondsToIso(secondary.resets_at) ??
                  (typeof secondary.resets_in_seconds === "number"
                    ? new Date(Date.now() + secondary.resets_in_seconds * 1000).toISOString()
                    : undefined)
              })
            : null
        ].filter(isUsageWindow);
        return withReset({
          used: percent,
          limit: 100,
          unit: "credits" as const,
          percent,
          status: getStatus(percent),
          resetsAt,
          source: "local" as const,
          windows: ensureLimitWindows(windows),
          message: rateLimit?.plan_type
        });
      } catch {
        continue;
      }
    }
  }

  return null;
}

function readCodexAccessToken() {
  const authPath = path.join(homedir(), ".codex", "auth.json");
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

async function fetchCodexUsage() {
  const accessToken = readCodexAccessToken();
  if (!accessToken) {
    return null;
  }

  const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  if (response.status === 401) {
    throw new Error("Codex 로그인 만료: codex login을 다시 실행하세요.");
  }
  if (!response.ok) {
    throw new Error(`Codex 사용량 API 오류: ${response.status}`);
  }

  const data = (await response.json()) as {
    plan_type?: string;
    rate_limit?: {
      primary_window?: { used_percent?: number; reset_at?: number };
      secondary_window?: { used_percent?: number; reset_at?: number };
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
  const windows = ensureLimitWindows([
    primary && typeof primary.used_percent === "number"
      ? createWindow({
          id: "primary",
          label: "5시간 한도",
          percent: primary.used_percent,
          resetsAt: unixSecondsToIso(primary.reset_at)
        })
      : null,
    weekly && typeof weekly.used_percent === "number"
      ? createWindow({
          id: "weekly",
          label: "주간 한도",
          percent: weekly.used_percent,
          resetsAt: unixSecondsToIso(weekly.reset_at)
        })
      : null
  ].filter(isUsageWindow));

  return withReset({
    used: percent,
    limit: 100,
    unit: "credits" as const,
    percent,
    status: getStatus(percent),
    resetsAt,
    source: "api" as const,
    windows,
    message: data.plan_type
  });
}

function readClaudeAccessToken() {
  const credentialsPath = path.join(homedir(), ".claude", ".credentials.json");
  if (existsSync(credentialsPath)) {
    try {
      const credentials = JSON.parse(readFileSync(credentialsPath, "utf8")) as {
        accessToken?: string;
        claudeAiOauth?: { accessToken?: string };
      };
      const token = credentials.claudeAiOauth?.accessToken ?? credentials.accessToken;
      if (token) {
        return token;
      }
    } catch {
      // Continue to Keychain fallback.
    }
  }

  if (process.platform === "darwin") {
    try {
      const raw = execFileSync("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 3_000
      }).trim();
      const credentials = JSON.parse(raw) as { accessToken?: string; claudeAiOauth?: { accessToken?: string } };
      return credentials.claudeAiOauth?.accessToken ?? credentials.accessToken;
    } catch {
      return null;
    }
  }

  return null;
}

async function fetchClaudeUsage(credential?: string) {
  const accessToken = credential ?? readClaudeAccessToken();
  if (!accessToken) {
    return null;
  }

  const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "anthropic-beta": "oauth-2025-04-20",
      "User-Agent": "claude-code/2.1.121"
    }
  });

  if (!response.ok) {
    throw new Error(`Claude 사용량 API 오류: ${response.status}`);
  }

  const data = (await response.json()) as {
    five_hour?: { utilization?: number; resets_at?: string };
    seven_day?: { utilization?: number; resets_at?: string };
  };
  const window = data.five_hour ?? data.seven_day;
  if (!window || typeof window.utilization !== "number") {
    return null;
  }

  const percent = Math.round(window.utilization);
  return withReset({
    used: percent,
    limit: 100,
    unit: "credits" as const,
    percent,
    status: getStatus(percent),
    resetsAt: window.resets_at,
    source: "api" as const,
    windows: ensureLimitWindows([
      data.five_hour && typeof data.five_hour.utilization === "number"
        ? createWindow({
            id: "primary",
            label: "5시간 한도",
            percent: data.five_hour.utilization,
            resetsAt: data.five_hour.resets_at
          })
        : null,
      data.seven_day && typeof data.seven_day.utilization === "number"
        ? createWindow({
            id: "weekly",
            label: "주간 한도",
            percent: data.seven_day.utilization,
            resetsAt: data.seven_day.resets_at
          })
        : null
    ].filter(isUsageWindow)),
    message: undefined
  });
}

function readGeminiLocalSession() {
  const credentialsPath = path.join(homedir(), ".gemini", "oauth_creds.json");
  if (!existsSync(credentialsPath)) {
    return null;
  }

  return withReset({
    used: 0,
    limit: 100,
    unit: "credits" as const,
    percent: 0,
    status: "ok" as const,
    source: "local" as const,
    windows: [
      createWindow({
        id: "daily",
        label: "오늘",
        percent: 0,
        resetsAt: nextLocalMidnight().toISOString(),
        message: "Gemini OAuth 세션 감지"
      })
    ],
    message: "Gemini 사용량 API 연결 대기"
  });
}

function geminiOAuthUsage() {
  return withReset({
    used: 0,
    limit: 100,
    unit: "credits" as const,
    percent: 0,
    status: "ok" as const,
    source: "api" as const,
    windows: [
      createWindow({
        id: "daily",
        label: "오늘",
        percent: 0,
        resetsAt: nextLocalMidnight().toISOString(),
        message: "Google OAuth 로그인"
      })
    ],
    message: "Gemini 사용량 API 연결 대기"
  });
}

const adapters: ProviderAdapter[] = PROVIDERS.map((provider) => ({
  ...provider,
  fetchUsage: async (auth?: ProviderAuth) => {
    const credential = auth?.accessToken;
    if (provider.id === "codex") {
      const codexUsage = isLocalProviderDetectionEnabled()
        ? (await fetchCodexUsage().catch(() => null)) ?? readLatestCodexUsage()
        : null;
      return codexUsage ?? seededUsage(provider.id, credential);
    }
    if (provider.id === "claude") {
      const claudeUsage = credential
        ? await fetchClaudeUsage(credential).catch(() => null)
        : isLocalProviderDetectionEnabled()
          ? await fetchClaudeUsage().catch(() => null)
          : null;
      return claudeUsage ?? seededUsage(provider.id, undefined);
    }
    if (provider.id === "gemini") {
      return (
        (isLocalProviderDetectionEnabled() ? readGeminiLocalSession() : null) ??
        (auth?.type === "oauth" ? geminiOAuthUsage() : seededUsage(provider.id, undefined))
      );
    }
    return seededUsage(provider.id, credential);
  }
}));

export async function fetchUsageSnapshot(settings: AppSettings): Promise<ProviderUsage[]> {
  const visibleAdapters = adapters.filter((adapter) => settings.providers[adapter.id].visible);

  return Promise.all(
    visibleAdapters.map(async (adapter) => {
      try {
        const providerSettings = settings.providers[adapter.id];
        const result = await adapter.fetchUsage(providerSettings.auth);
        return {
          provider: adapter.id,
          label: adapter.label,
          updatedAt: new Date().toISOString(),
          ...result
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
          message: error instanceof Error ? error.message : "사용량을 불러오지 못했습니다."
        };
      }
    })
  );
}
