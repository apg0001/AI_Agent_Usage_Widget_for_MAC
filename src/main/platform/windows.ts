import { PlatformAdapter } from "./types.js";

export const windowsPlatform: PlatformAdapter = {
  id: "windows",
  hideFromDock: () => undefined,
  readClaudeKeychainAccessToken: () => null
};
