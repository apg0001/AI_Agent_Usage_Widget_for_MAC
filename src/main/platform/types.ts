import { App } from "electron";

export type AppPlatform = "mac" | "windows" | "linux";

export type ClaudeCredential = {
  accessToken: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: number | string;
  organizationUuid?: string;
};

export type ClaudeCredentialUpdate = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
};

export type PlatformAdapter = {
  id: AppPlatform;
  hideFromDock: (app: App) => void;
  readClaudeKeychainCredential: () => ClaudeCredential | null;
  writeClaudeKeychainCredential: (update: ClaudeCredentialUpdate) => boolean;
  getLaunchAtLogin: (app: App) => boolean;
  setLaunchAtLogin: (app: App, enabled: boolean) => void;
};
