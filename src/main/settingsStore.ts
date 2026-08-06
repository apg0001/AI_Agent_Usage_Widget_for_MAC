import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AppSettings, ProviderId } from "../shared/types.js";

type StoreShape = {
  settings: AppSettings;
};

const defaultSettings: AppSettings = {
  refreshIntervalMs: 10_000,
  providers: {
    codex: { visible: true },
    claude: { visible: true },
    gemini: { visible: true }
  }
};

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
    return {
      settings: {
        ...defaultSettings,
        ...parsed.settings,
        providers: {
          ...defaultSettings.providers,
          ...parsed.settings?.providers
        }
      }
    };
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

export function saveSettings(settings: AppSettings): AppSettings {
  writeStore({ settings });
  return settings;
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

export function setProviderToken(provider: ProviderId, token: string): AppSettings {
  const settings = getSettings();
  return saveSettings({
    ...settings,
    providers: {
      ...settings.providers,
      [provider]: {
        ...settings.providers[provider],
        token
      }
    }
  });
}

export function clearProviderToken(provider: ProviderId): AppSettings {
  const settings = getSettings();
  const nextProvider = { ...settings.providers[provider] };
  delete nextProvider.token;

  return saveSettings({
    ...settings,
    providers: {
      ...settings.providers,
      [provider]: nextProvider
    }
  });
}
