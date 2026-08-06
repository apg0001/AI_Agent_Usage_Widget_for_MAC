import Store from "electron-store";
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

const store = new Store<StoreShape>({
  name: "ai-usage-widget",
  defaults: {
    settings: defaultSettings
  }
});

export function getSettings(): AppSettings {
  return store.get("settings");
}

export function saveSettings(settings: AppSettings): AppSettings {
  store.set("settings", settings);
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
