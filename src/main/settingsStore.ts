import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  AppSettings,
  NotificationSettings,
  PublicAppSettings,
  ProviderId,
  ProviderNotificationSettings,
  PROVIDERS
} from "../shared/types.js";

type StoreShape = {
  settings: AppSettings;
};

const defaultProviderNotifications: ProviderNotificationSettings = {
  enabled: true,
  thresholds: [75, 90, 100],
  resetEnabled: true,
  projectedExhaustionEnabled: true
};

export const defaultNotificationSettings: NotificationSettings = {
  enabled: true,
  cooldownMinutes: 30,
  quietHours: {
    enabled: false,
    start: "22:00",
    end: "08:00"
  },
  providers: {
    codex: { ...defaultProviderNotifications },
    claude: { ...defaultProviderNotifications },
    gemini: { ...defaultProviderNotifications }
  }
};

const defaultSettings: AppSettings = {
  refreshIntervalMs: 10_000,
  menuBarDisplayMode: "icons",
  notifications: defaultNotificationSettings,
  providers: {
    codex: { visible: true },
    claude: { visible: true },
    gemini: { visible: true }
  }
};

function normalizeThresholds(value: unknown, fallback = defaultProviderNotifications.thresholds) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  if (value.length === 0) {
    return [];
  }

  const thresholds = [...new Set(value
    .filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    .map((item) => Math.round(Math.min(100, Math.max(1, item)))))]
    .sort((a, b) => a - b);
  return thresholds.length ? thresholds : [...fallback];
}

function normalizeTime(value: unknown, fallback: string) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
}

function normalizeProviderNotifications(value: unknown): ProviderNotificationSettings {
  const raw = value && typeof value === "object" ? value as Partial<ProviderNotificationSettings> : {};
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaultProviderNotifications.enabled,
    thresholds: normalizeThresholds(raw.thresholds),
    resetEnabled: typeof raw.resetEnabled === "boolean" ? raw.resetEnabled : defaultProviderNotifications.resetEnabled,
    projectedExhaustionEnabled: typeof raw.projectedExhaustionEnabled === "boolean"
      ? raw.projectedExhaustionEnabled
      : defaultProviderNotifications.projectedExhaustionEnabled
  };
}

export function normalizeNotificationSettings(value: unknown): NotificationSettings {
  const raw = value && typeof value === "object" ? value as Partial<NotificationSettings> : {};
  const rawQuietHours = raw.quietHours && typeof raw.quietHours === "object" ? raw.quietHours : undefined;
  const rawProviders = raw.providers && typeof raw.providers === "object" ? raw.providers : undefined;
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaultNotificationSettings.enabled,
    cooldownMinutes: typeof raw.cooldownMinutes === "number" && Number.isFinite(raw.cooldownMinutes)
      ? Math.round(Math.min(1_440, Math.max(1, raw.cooldownMinutes)))
      : defaultNotificationSettings.cooldownMinutes,
    quietHours: {
      enabled: typeof rawQuietHours?.enabled === "boolean"
        ? rawQuietHours.enabled
        : defaultNotificationSettings.quietHours.enabled,
      start: normalizeTime(rawQuietHours?.start, defaultNotificationSettings.quietHours.start),
      end: normalizeTime(rawQuietHours?.end, defaultNotificationSettings.quietHours.end)
    },
    providers: {
      codex: normalizeProviderNotifications(rawProviders?.codex),
      claude: normalizeProviderNotifications(rawProviders?.claude),
      gemini: normalizeProviderNotifications(rawProviders?.gemini)
    }
  };
}

function normalizeSettings(value: unknown): AppSettings {
  const raw = value && typeof value === "object" ? value as Partial<AppSettings> : {};
  const rawProviders = raw.providers && typeof raw.providers === "object" ? raw.providers : undefined;
  const providers = { ...defaultSettings.providers } as AppSettings["providers"];

  for (const provider of PROVIDERS) {
    const rawProvider = rawProviders?.[provider.id] as unknown;
    const rawProviderObject = rawProvider && typeof rawProvider === "object"
      ? rawProvider as Partial<AppSettings["providers"][ProviderId]>
      : {};
    const normalizedProvider = {
      ...defaultSettings.providers[provider.id],
      ...rawProviderObject,
      visible: typeof rawProviderObject.visible === "boolean"
        ? rawProviderObject.visible
        : defaultSettings.providers[provider.id].visible
    };
    providers[provider.id] = normalizedProvider;
    if (normalizedProvider.auth && !["token", "oauth"].includes(normalizedProvider.auth.type)) {
      delete normalizedProvider.auth;
    }
    if (provider.id === "claude" && normalizedProvider.auth?.type === "token") {
      delete normalizedProvider.auth;
    }
  }

  const refreshIntervalMs = typeof raw.refreshIntervalMs === "number" && Number.isFinite(raw.refreshIntervalMs)
    ? Math.round(Math.min(30 * 60_000, Math.max(10_000, raw.refreshIntervalMs)))
    : defaultSettings.refreshIntervalMs;

  return {
    refreshIntervalMs,
    menuBarDisplayMode: raw.menuBarDisplayMode === "iconsWithPercent" ? "iconsWithPercent" : "icons",
    notifications: normalizeNotificationSettings(raw.notifications),
    providers
  };
}

function getStorePath() {
  const directory = app.getPath("userData");
  return path.join(directory, "ai-usage-widget.json");
}

function readStore(): StoreShape {
  const storePath = getStorePath();

  if (!existsSync(storePath)) {
    return { settings: defaultSettings };
  }

  try {
    const parsed = JSON.parse(readFileSync(storePath, "utf8")) as Partial<StoreShape>;
    return { settings: normalizeSettings(parsed.settings) };
  } catch {
    return { settings: defaultSettings };
  }
}

function writeStore(store: StoreShape) {
  const storePath = getStorePath();
  mkdirSync(path.dirname(storePath), { recursive: true });
  writeFileSync(storePath, JSON.stringify(store, null, 2));
}

export function getSettings(): AppSettings {
  return readStore().settings;
}

export function toPublicSettings(settings: AppSettings): PublicAppSettings {
  return {
    refreshIntervalMs: settings.refreshIntervalMs,
    menuBarDisplayMode: settings.menuBarDisplayMode,
    notifications: normalizeNotificationSettings(settings.notifications),
    providers: {
      codex: {
        visible: settings.providers.codex.visible,
        hasSavedAuth: Boolean(settings.providers.codex.auth)
      },
      claude: {
        visible: settings.providers.claude.visible,
        hasSavedAuth: Boolean(settings.providers.claude.auth)
      },
      gemini: {
        visible: settings.providers.gemini.visible,
        hasSavedAuth: Boolean(settings.providers.gemini.auth)
      }
    }
  };
}

export function saveSettings(settings: AppSettings): AppSettings {
  const normalized = normalizeSettings(settings);
  writeStore({ settings: normalized });
  return normalized;
}

export function setProviderVisibility(provider: ProviderId, visible: boolean): AppSettings {
  const settings = getSettings();
  return saveSettings({
    ...settings,
    providers: {
      ...settings.providers,
      [provider]: {
        ...settings.providers[provider],
        visible
      }
    }
  });
}

export function setMenuBarDisplayMode(menuBarDisplayMode: AppSettings["menuBarDisplayMode"]): AppSettings {
  const settings = getSettings();
  return saveSettings({
    ...settings,
    menuBarDisplayMode
  });
}

export function setRefreshIntervalMs(refreshIntervalMs: number): AppSettings {
  const settings = getSettings();
  return saveSettings({
    ...settings,
    refreshIntervalMs
  });
}

export function setNotificationSettings(notifications: NotificationSettings): AppSettings {
  const settings = getSettings();
  return saveSettings({
    ...settings,
    notifications: normalizeNotificationSettings(notifications)
  });
}

export function setProviderToken(provider: ProviderId, token: string): AppSettings {
  const settings = getSettings();
  return saveSettings({
    ...settings,
    providers: {
      ...settings.providers,
      [provider]: {
        ...settings.providers[provider],
        auth: {
          type: "token",
          accessToken: token,
          accountLabel: "토큰"
        }
      }
    }
  });
}

export function clearProviderAuth(provider: ProviderId): AppSettings {
  const settings = getSettings();
  const nextProvider = { ...settings.providers[provider] };
  delete nextProvider.auth;

  return saveSettings({
    ...settings,
    providers: {
      ...settings.providers,
      [provider]: nextProvider
    }
  });
}

export function setProviderOAuth(
  provider: ProviderId,
  auth: NonNullable<AppSettings["providers"][ProviderId]["auth"]>
): AppSettings {
  const settings = getSettings();
  return saveSettings({
    ...settings,
    providers: {
      ...settings.providers,
      [provider]: {
        ...settings.providers[provider],
        auth
      }
    }
  });
}
