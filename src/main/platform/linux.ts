import { App } from "electron";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { PlatformAdapter } from "./types.js";

// Electron의 app.setLoginItemSettings는 Linux를 지원하지 않아 XDG 자동 시작 스펙에 맞춰
// ~/.config/autostart에 .desktop 파일을 직접 쓰고 지운다.
const AUTOSTART_DIR = path.join(homedir(), ".config", "autostart");
const AUTOSTART_DESKTOP_FILE = path.join(AUTOSTART_DIR, "quota-bar.desktop");

function resolveExecutablePath(app: App) {
  // AppImage로 실행 중이면 마운트된 임시 경로 대신 원본 AppImage 경로를 써야 재부팅 후에도 유효하다.
  return process.env.APPIMAGE ?? app.getPath("exe");
}

function getLaunchAtLogin(app: App): boolean {
  if (!app.isPackaged) {
    return false;
  }
  return existsSync(AUTOSTART_DESKTOP_FILE);
}

function setLaunchAtLogin(app: App, enabled: boolean): void {
  if (!app.isPackaged) {
    return;
  }

  if (!enabled) {
    if (existsSync(AUTOSTART_DESKTOP_FILE)) {
      unlinkSync(AUTOSTART_DESKTOP_FILE);
    }
    return;
  }

  mkdirSync(AUTOSTART_DIR, { recursive: true });
  const desktopEntry = [
    "[Desktop Entry]",
    "Type=Application",
    "Name=GigaCharge",
    `Exec="${resolveExecutablePath(app)}"`,
    "X-GNOME-Autostart-enabled=true",
    ""
  ].join("\n");
  writeFileSync(AUTOSTART_DESKTOP_FILE, desktopEntry, "utf8");
}

export const linuxPlatform: PlatformAdapter = {
  id: "linux",
  hideFromDock: () => undefined,
  readClaudeKeychainCredential: () => null,
  writeClaudeKeychainCredential: () => false,
  getLaunchAtLogin,
  setLaunchAtLogin
};
