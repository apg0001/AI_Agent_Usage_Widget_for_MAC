import { PlatformAdapter } from "./types.js";

export const linuxPlatform: PlatformAdapter = {
  id: "linux",
  hideFromDock: () => undefined,
  readClaudeKeychainAccessToken: () => null
};
