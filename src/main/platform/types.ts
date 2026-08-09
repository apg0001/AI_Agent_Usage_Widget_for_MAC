import { App } from "electron";

export type AppPlatform = "mac" | "windows" | "linux";

export type ClaudeCredential = {
  accessToken: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: number | string;
  organizationUuid?: string;
};

export type PlatformAdapter = {
  id: AppPlatform;
  hideFromDock: (app: App) => void;
  readClaudeKeychainCredential: () => ClaudeCredential | null;
  getLaunchAtLogin: (app: App) => boolean;
  setLaunchAtLogin: (app: App, enabled: boolean) => void;
};
