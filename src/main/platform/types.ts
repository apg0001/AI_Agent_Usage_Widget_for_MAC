import { App } from "electron";

export type AppPlatform = "mac" | "windows" | "linux";

export type PlatformAdapter = {
  id: AppPlatform;
  hideFromDock: (app: App) => void;
  readClaudeKeychainAccessToken: () => string | null;
};
