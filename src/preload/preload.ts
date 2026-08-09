import { contextBridge, ipcRenderer } from "electron";
import {
  LanguageSetting,
  NotificationSettings,
  ProviderHistory,
  ProviderId,
  ThemeSetting,
  TokenLoginPayload,
  UpdateStatus,
  UsageHistoryRange,
  UsageSnapshot
} from "../shared/types.js";

const api = {
  getUsage: () => ipcRenderer.invoke("usage:get") as Promise<UsageSnapshot>,
  refreshUsage: () => ipcRenderer.invoke("usage:refresh") as Promise<UsageSnapshot>,
  setProviderVisibility: (provider: ProviderId, visible: boolean) =>
    ipcRenderer.invoke("provider:visibility", provider, visible) as Promise<UsageSnapshot>,
  setMenuBarDisplayMode: (mode: "icons" | "iconsWithPercent") =>
    ipcRenderer.invoke("settings:menu-bar-display-mode", mode) as Promise<UsageSnapshot>,
  setTheme: (theme: ThemeSetting) => ipcRenderer.invoke("settings:theme", theme) as Promise<UsageSnapshot>,
  setLanguage: (language: LanguageSetting) => ipcRenderer.invoke("settings:language", language) as Promise<UsageSnapshot>,
  setRefreshIntervalMs: (intervalMs: number) =>
    ipcRenderer.invoke("settings:refresh-interval", intervalMs) as Promise<UsageSnapshot>,
  setNotificationSettings: (settings: NotificationSettings) =>
    ipcRenderer.invoke("settings:notifications", settings) as Promise<UsageSnapshot>,
  getHistory: (provider: ProviderId, range: UsageHistoryRange = "24h") =>
    ipcRenderer.invoke("history:get", provider, range) as Promise<ProviderHistory>,
  tokenLogin: (payload: TokenLoginPayload) =>
    ipcRenderer.invoke("provider:token-login", payload) as Promise<UsageSnapshot>,
  oauthLogin: (provider: ProviderId) =>
    ipcRenderer.invoke("provider:oauth-login", provider) as Promise<{
      result: import("../shared/types.js").OAuthLoginResult;
      snapshot: UsageSnapshot;
    }>,
  logout: (provider: ProviderId) => ipcRenderer.invoke("provider:logout", provider) as Promise<UsageSnapshot>,
  quit: () => ipcRenderer.invoke("app:quit") as Promise<void>,
  getLaunchAtLogin: () => ipcRenderer.invoke("app:get-launch-at-login") as Promise<boolean>,
  setLaunchAtLogin: (enabled: boolean) => ipcRenderer.invoke("app:set-launch-at-login", enabled) as Promise<boolean>,
  copyDiagnostics: () => ipcRenderer.invoke("app:copy-diagnostics") as Promise<boolean>,
  openStatusPage: (provider: ProviderId) => ipcRenderer.invoke("app:open-status-page", provider) as Promise<void>,
  getAppVersion: () => ipcRenderer.invoke("app:get-version") as Promise<string>,
  getUpdateStatus: () => ipcRenderer.invoke("app:get-update-status") as Promise<UpdateStatus>,
  checkForUpdates: () => ipcRenderer.invoke("app:check-for-updates") as Promise<void>,
  quitAndInstallUpdate: () => ipcRenderer.invoke("app:quit-and-install-update") as Promise<void>,
  onUsageSnapshot: (callback: (snapshot: UsageSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: UsageSnapshot) => callback(snapshot);
    ipcRenderer.on("usage:snapshot", listener);
    return () => {
      ipcRenderer.removeListener("usage:snapshot", listener);
    };
  },
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status);
    ipcRenderer.on("update:status", listener);
    return () => {
      ipcRenderer.removeListener("update:status", listener);
    };
  }
};

contextBridge.exposeInMainWorld("aiUsage", api);

export type AiUsageApi = typeof api;
