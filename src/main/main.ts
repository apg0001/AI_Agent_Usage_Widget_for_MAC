import { app, BrowserWindow, ipcMain, Menu, screen, Tray } from "electron";
import path from "node:path";
import { getRendererIndexPath } from "./rendererPath.js";
import { startOAuthLogin } from "./oauthProviders.js";
import { platformAdapter } from "./platform/index.js";
import {
  clearProviderAuth,
  getSettings,
  setMenuBarDisplayMode,
  setProviderToken,
  setProviderVisibility
} from "./settingsStore.js";
import { buildStaticTrayIconSvg, buildUsageTrayIconSvg, TRAY_ICON_RENDER_SIZE } from "./trayIcon.js";
import { destroyTrayIconRenderer, renderSvgToNativeImage } from "./trayIconRenderer.js";
import { getTrayTitle } from "./trayTitle.js";
import { fetchUsageSnapshot } from "./usageProviders.js";
import { ProviderId, TokenLoginPayload, UsageSnapshot } from "../shared/types.js";

const isDev = !app.isPackaged;

let tray: Tray | null = null;
let window: BrowserWindow | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let latestSnapshot: UsageSnapshot | null = null;

function showWindow() {
  if (!window) {
    return;
  }

  positionWindow();
  window.show();
  window.focus();
  window.moveTop();
}

async function createStaticTrayIcon() {
  const image = await renderSvgToNativeImage(buildStaticTrayIconSvg(), 32);
  image.setTemplateImage(true);
  return image;
}

function createWindow() {
  window = new BrowserWindow({
    width: 420,
    height: 640,
    show: false,
    resizable: false,
    fullscreenable: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.once("ready-to-show", () => {
    if (process.env.AI_USAGE_WIDGET_SHOW_ON_LAUNCH) {
      showWindow();
    }
  });

  window.webContents.once("did-finish-load", () => {
    if (process.env.AI_USAGE_WIDGET_SHOW_ON_LAUNCH && !window?.isVisible()) {
      showWindow();
    }
  });

  if (isDev) {
    void window.loadURL("http://127.0.0.1:5173");
  } else {
    void window.loadFile(getRendererIndexPath(__dirname));
  }

  window.on("blur", () => {
    if (!process.env.AI_USAGE_WIDGET_SHOW_ON_LAUNCH) {
      window?.hide();
    }
  });
}

function positionWindow() {
  if (!window) {
    return;
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const workArea = display.workArea;
  const windowBounds = window.getBounds();
  const trayBounds = tray?.getBounds();
  const targetX = trayBounds
    ? Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2)
    : Math.round(workArea.x + workArea.width / 2 - windowBounds.width / 2);
  const targetY = trayBounds ? Math.round(trayBounds.y + trayBounds.height + 8) : Math.round(workArea.y + 24);
  const x = Math.min(Math.max(targetX, workArea.x + 8), workArea.x + workArea.width - windowBounds.width - 8);
  const y = Math.min(Math.max(targetY, workArea.y + 8), workArea.y + workArea.height - windowBounds.height - 8);
  window.setPosition(x, y, false);
}

function toggleWindow() {
  if (!window) {
    return;
  }

  if (window.isVisible()) {
    window.hide();
    return;
  }

  showWindow();
}

async function updateTray(snapshot: UsageSnapshot) {
  if (platformAdapter.id === "mac") {
    tray?.setTitle(getTrayTitle(snapshot));
  } else {
    // macOS 전용인 Tray.setTitle 대신 아이콘 비트맵에 사용량 텍스트를 직접 그린다.
    const image = await renderSvgToNativeImage(buildUsageTrayIconSvg(snapshot), TRAY_ICON_RENDER_SIZE);
    tray?.setImage(image);
  }
  tray?.setToolTip(`Quota Bar\n${getTrayTitle(snapshot)}`);
}

async function refreshUsage() {
  const settings = getSettings();
  const usage = await fetchUsageSnapshot(settings);
  latestSnapshot = { settings, usage };
  await updateTray(latestSnapshot);
  window?.webContents.send("usage:snapshot", latestSnapshot);
  return latestSnapshot;
}

function restartRefreshTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  refreshTimer = setInterval(() => {
    void refreshUsage();
  }, getSettings().refreshIntervalMs);
}

function registerIpc() {
  ipcMain.handle("usage:get", async () => latestSnapshot ?? refreshUsage());
  ipcMain.handle("usage:refresh", async () => refreshUsage());
  ipcMain.handle("provider:visibility", async (_event, provider: ProviderId, visible: boolean) => {
    setProviderVisibility(provider, visible);
    restartRefreshTimer();
    return refreshUsage();
  });
  ipcMain.handle("settings:menu-bar-display-mode", async (_event, mode: "icons" | "iconsWithPercent") => {
    setMenuBarDisplayMode(mode);
    return refreshUsage();
  });
  ipcMain.handle("provider:token-login", async (_event, payload: TokenLoginPayload) => {
    if (payload.provider !== "codex") {
      throw new Error("토큰 로그인은 Codex만 지원합니다.");
    }
    setProviderToken(payload.provider, payload.token);
    return refreshUsage();
  });
  ipcMain.handle("provider:oauth-login", async (_event, provider: ProviderId) => {
    const result = await startOAuthLogin(provider);
    const snapshot = await refreshUsage();
    return { result, snapshot };
  });
  ipcMain.handle("provider:logout", async (_event, provider: ProviderId) => {
    clearProviderAuth(provider);
    return refreshUsage();
  });
  ipcMain.handle("app:quit", () => app.quit());
}

app.whenReady().then(async () => {
  platformAdapter.hideFromDock(app);
  Menu.setApplicationMenu(null);
  registerIpc();
  createWindow();
  tray = new Tray(await createStaticTrayIcon());
  const trayMenu = Menu.buildFromTemplate([
    { label: "Quota Bar 열기", click: toggleWindow },
    { type: "separator" },
    { label: "종료", click: () => app.quit() }
  ]);
  tray.on("click", toggleWindow);
  tray.on("right-click", () => {
    tray?.popUpContextMenu(trayMenu);
  });
  void refreshUsage();
  restartRefreshTimer();
  if (process.env.AI_USAGE_WIDGET_SHOW_ON_LAUNCH) {
    setTimeout(showWindow, 500);
  }
});

app.on("window-all-closed", () => {
  window = null;
});

app.on("before-quit", () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  destroyTrayIconRenderer();
});
