import { linuxPlatform } from "./linux.js";
import { macPlatform } from "./mac.js";
import { PlatformAdapter } from "./types.js";
import { windowsPlatform } from "./windows.js";

export function getPlatformAdapter(platform = process.platform): PlatformAdapter {
  if (platform === "darwin") {
    return macPlatform;
  }
  if (platform === "win32") {
    return windowsPlatform;
  }
  return linuxPlatform;
}

export const platformAdapter = getPlatformAdapter();
