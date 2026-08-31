import { getLoginItemLaunchAtLogin, setLoginItemLaunchAtLogin } from "./loginItem.js";
import { PlatformAdapter } from "./types.js";

export const windowsPlatform: PlatformAdapter = {
  id: "windows",
  hideFromDock: () => undefined,
  readClaudeKeychainCredential: () => null,
  writeClaudeKeychainCredential: () => false,
  getLaunchAtLogin: getLoginItemLaunchAtLogin,
  setLaunchAtLogin: setLoginItemLaunchAtLogin
};
