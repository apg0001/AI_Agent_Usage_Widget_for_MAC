import { contextBridge, ipcRenderer } from "electron";
import { ProviderId, UsageSnapshot } from "../shared/types.js";

const api = {
  getUsage: () => ipcRenderer.invoke("usage:get") as Promise<UsageSnapshot>,
  refreshUsage: () => ipcRenderer.invoke("usage:refresh") as Promise<UsageSnapshot>,
  setProviderVisibility: (provider: ProviderId, visible: boolean) =>
    ipcRenderer.invoke("provider:visibility", provider, visible) as Promise<UsageSnapshot>,
  setMenuBarDisplayMode: (mode: "icons" | "iconsWithPercent") =>
    ipcRenderer.invoke("settings:menu-bar-display-mode", mode) as Promise<UsageSnapshot>,
  oauthLogin: (provider: ProviderId) =>
    ipcRenderer.invoke("provider:oauth-login", provider) as Promise<{
      result: import("../shared/types.js").OAuthLoginResult;
      snapshot: UsageSnapshot;
    }>,
  logout: (provider: ProviderId) => ipcRenderer.invoke("provider:logout", provider) as Promise<UsageSnapshot>,
  quit: () => ipcRenderer.invoke("app:quit") as Promise<void>,
  onUsageSnapshot: (callback: (snapshot: UsageSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: UsageSnapshot) => callback(snapshot);
    ipcRenderer.on("usage:snapshot", listener);
    return () => {
      ipcRenderer.removeListener("usage:snapshot", listener);
    };
  }
};

contextBridge.exposeInMainWorld("aiUsage", api);

export type AiUsageApi = typeof api;
