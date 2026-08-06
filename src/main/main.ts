import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from "electron";
import path from "node:path";
import { getRendererIndexPath } from "./rendererPath.js";
import { startOAuthLogin } from "./oauthProviders.js";
import { clearProviderToken, getSettings, setProviderToken, setProviderVisibility } from "./settingsStore.js";
import { fetchUsageSnapshot } from "./usageProviders.js";
import { LoginPayload, ProviderId, UsageSnapshot } from "../shared/types.js";

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

function createTrayIcon() {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill="#111827"/>
      <path d="M9 21L14 8h4l5 13h-4l-.9-2.8h-4.4L12.8 21H9zm5.5-5.8h2.9L16 10.8l-1.5 4.4z" fill="#fff"/>
    </svg>
  `);
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;charset=UTF-8,${svg}`);
  image.setTemplateImage(true);
  return image;
}

function createWindow() {
  window = new BrowserWindow({
    width: 380,
    height: 560,
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

function updateTray(snapshot: UsageSnapshot) {
  const visibleUsage = snapshot.usage.filter((usage) => usage.status !== "signed-out");
  const average = visibleUsage.length
    ? Math.round(visibleUsage.reduce((sum, usage) => sum + usage.percent, 0) / visibleUsage.length)
    : 0;

  tray?.setTitle(visibleUsage.length ? `AI ${average}%` : "AI");
  tray?.setToolTip("AI 사용량 위젯");
}

async function refreshUsage() {
  const settings = getSettings();
  const usage = await fetchUsageSnapshot(settings);
  latestSnapshot = { settings, usage };
  updateTray(latestSnapshot);
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
  ipcMain.handle("provider:login", async (_event, payload: LoginPayload) => {
    setProviderToken(payload.provider, payload.token);
    return refreshUsage();
  });
  ipcMain.handle("provider:oauth-login", async (_event, provider: ProviderId) => {
    const result = await startOAuthLogin(provider);
    const snapshot = await refreshUsage();
    return { result, snapshot };
  });
  ipcMain.handle("provider:logout", async (_event, provider: ProviderId) => {
    clearProviderToken(provider);
    return refreshUsage();
  });
  ipcMain.handle("app:quit", () => app.quit());
}

app.whenReady().then(() => {
  app.dock?.hide();
  Menu.setApplicationMenu(null);
  registerIpc();
  createWindow();
  tray = new Tray(createTrayIcon());
  const trayMenu = Menu.buildFromTemplate([
    { label: "AI 사용량 열기", click: toggleWindow },
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
});
