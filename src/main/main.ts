import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, Notification, screen, shell, Tray } from "electron";
import path from "node:path";
import {
  checkForUpdates,
  getLatestUpdateStatus,
  initAutoUpdate,
  onUpdateStatusChange,
  quitAndInstallUpdate
} from "./appUpdater.js";
import { serializeDiagnosticsReport } from "./diagnostics.js";
import { GenerationRefreshQueue } from "./generationRefreshQueue.js";
import { getTranslations } from "../shared/i18n.js";
import { getRendererIndexPath } from "./rendererPath.js";
import { startOAuthLogin } from "./oauthProviders.js";
import { platformAdapter } from "./platform/index.js";
import {
  getAllProviderServiceStatuses,
  ProviderServiceStatus as RawServiceStatus,
  rememberKnownServiceState
} from "./serviceStatus.js";
import {
  clearProviderAuth,
  getSettings,
  setLanguage,
  setMenuBarDisplayMode,
  setNotificationSettings,
  setRefreshIntervalMs,
  setProviderToken,
  setProviderVisibility,
  setTheme,
  toPublicSettings
} from "./settingsStore.js";
import { buildStaticTrayIconSvg, buildUsageTrayIconSvg, TRAY_ICON_RENDER_SIZE } from "./trayIcon.js";
import { destroyTrayIconRenderer, renderSvgToNativeImage } from "./trayIconRenderer.js";
import { getTrayTitle } from "./trayTitle.js";
import { UsageHistoryStore } from "./usageHistoryStore.js";
import { enrichUsageWithInsights } from "./usageInsights.js";
import { isWithinQuietHours, UsageNotificationDetector, UsageNotificationEvent } from "./usageNotifications.js";
import { fetchUsageSnapshot, formatRemaining } from "./usageProviders.js";
import {
  AppSettings,
  NotificationSettings,
  ProviderId,
  ProviderServiceStatus,
  PROVIDERS,
  TokenLoginPayload,
  UsageHistoryRange,
  UsageSnapshot
} from "../shared/types.js";

const isDev = !app.isPackaged;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

let tray: Tray | null = null;
let window: BrowserWindow | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let serviceStatusTimer: ReturnType<typeof setInterval> | null = null;
let updateCheckTimer: ReturnType<typeof setInterval> | null = null;
let blurHideTimer: ReturnType<typeof setTimeout> | null = null;
let latestSnapshot: UsageSnapshot | null = null;
let usageHistoryStore: UsageHistoryStore | null = null;
let latestServiceStatuses: Partial<Record<ProviderId, RawServiceStatus>> = {};
const usageNotificationDetector = new UsageNotificationDetector();
const lastServiceStates = new Map<ProviderId, RawServiceStatus["state"]>();
const usageRefreshQueue = new GenerationRefreshQueue<UsageSnapshot>(performUsageRefresh);

const STATUS_PAGE_URLS: Partial<Record<ProviderId, string>> = {
  codex: "https://status.openai.com/",
  claude: "https://status.claude.com/"
};

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60_000;

function showWindow() {
  if (!window) {
    return;
  }

  if (blurHideTimer) {
    clearTimeout(blurHideTimer);
    blurHideTimer = null;
  }
  positionWindow();
  window.show();
  window.focus();
  window.moveTop();
}

async function createStaticTrayIcon() {
  if (platformAdapter.id === "mac") {
    // macOS는 Tray.setTitle로 에이전트별 이름/사용률 텍스트만 보여주면 충분하고,
    // 아이콘 비트맵(숨겨진 창을 캡처하는 방식)은 투명 배경이 온전히 보존되지 않아
    // 메뉴바에 불필요한 흰 여백 블록으로 보이는 문제가 있어 아이콘 자체를 비워둔다.
    return nativeImage.createEmpty();
  }
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

  window.webContents.on("before-input-event", (_event, input) => {
    const isDevToolsShortcut = input.type === "keyDown" && (
      input.key === "F12" ||
      (input.control && input.shift && (input.key === "I" || input.key === "i"))
    );
    if (isDevToolsShortcut) {
      window?.webContents.toggleDevTools();
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
    if (process.env.AI_USAGE_WIDGET_SHOW_ON_LAUNCH) {
      return;
    }
    if (activeNotifications > 0) {
      // The blur is most likely caused by interacting with one of our own
      // notification toasts (clicking it, dismissing it), not the user
      // clicking away from the panel. Don't hide for it; releaseNotification
      // re-focuses the panel once the notification is gone.
      return;
    }
    // A blur can otherwise still fire from a transient, unrelated focus shift
    // rather than the user actually clicking away. Debounce and re-check so
    // those don't hide the panel either.
    if (blurHideTimer) {
      clearTimeout(blurHideTimer);
    }
    blurHideTimer = setTimeout(() => {
      blurHideTimer = null;
      if (window && !window.isDestroyed() && !window.isFocused() && activeNotifications === 0) {
        window.hide();
      }
    }, 150);
  });
}

let activeNotifications = 0;

function releaseNotification() {
  activeNotifications = Math.max(0, activeNotifications - 1);
  if (activeNotifications === 0 && window && !window.isDestroyed() && window.isVisible()) {
    window.focus();
  }
}

function showNotification(options: Electron.NotificationConstructorOptions) {
  const notification = new Notification(options);
  activeNotifications += 1;
  let settled = false;
  const release = () => {
    if (settled) {
      return;
    }
    settled = true;
    releaseNotification();
  };
  notification.once("close", release);
  notification.once("click", release);
  notification.once("failed", release);
  notification.show();
}

function positionWindow() {
  if (!window) {
    return;
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const workArea = display.workArea;
  const preferredHeight = Math.max(1, Math.min(640, workArea.height - 16));
  const currentBounds = window.getBounds();
  if (currentBounds.height !== preferredHeight) {
    window.setSize(currentBounds.width, preferredHeight, false);
  }
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

async function updateTray(snapshot: UsageSnapshot, generation: number) {
  if (platformAdapter.id === "mac") {
    if (!usageRefreshQueue.isCurrent(generation)) {
      return;
    }
    tray?.setTitle(getTrayTitle(snapshot));
  } else {
    // macOS 전용인 Tray.setTitle 대신 아이콘 비트맵에 사용량 텍스트를 직접 그린다.
    const image = await renderSvgToNativeImage(buildUsageTrayIconSvg(snapshot), TRAY_ICON_RENDER_SIZE);
    if (!usageRefreshQueue.isCurrent(generation)) {
      return;
    }
    tray?.setImage(image);
  }
  if (!usageRefreshQueue.isCurrent(generation)) {
    return;
  }
  tray?.setToolTip(`Quota Bar\n${getTrayTitle(snapshot)}`);
}

function usageEventContent(event: UsageNotificationEvent, language: AppSettings["language"]) {
  const t = getTranslations(language);
  if (event.type === "reset") {
    return { title: t.main.usageResetTitle(event.providerLabel), body: t.main.usageResetBody(event.windowLabel) };
  }
  if (event.type === "threshold") {
    return {
      title: t.main.usageThresholdTitle(event.providerLabel, event.windowLabel, event.threshold ?? 0),
      body: t.main.usageThresholdBody(event.percent, event.resetsAt ? formatRemaining(event.resetsAt, language) : undefined)
    };
  }
  return { title: t.main.usageProjectedTitle(event.providerLabel), body: t.main.usageProjectedBody(event.windowLabel) };
}

function notifyUsageEvents(snapshot: UsageSnapshot) {
  if (!Notification.isSupported()) {
    return;
  }

  for (const event of usageNotificationDetector.detect(snapshot.usage, snapshot.settings.notifications)) {
    const { title, body } = usageEventContent(event, snapshot.settings.language);
    showNotification({ title, body });
  }
}

function sharedServiceStatus(provider: ProviderId, language: AppSettings["language"]): ProviderServiceStatus {
  const t = getTranslations(language);
  const status = latestServiceStatuses[provider];
  if (!status || status.state === "unknown") {
    return {
      state: "unknown",
      label: t.main.serviceStatusUnknownLabel,
      checkedAt: status?.checkedAt,
      statusPageUrl: STATUS_PAGE_URLS[provider]
    };
  }

  const state = status.state === "outage" ? "outage" : status.state === "operational" ? "operational" : "degraded";
  const label = state === "operational" ? t.main.serviceOperationalLabel : state === "outage" ? t.main.serviceOutageLabel : t.main.serviceDegradedLabel;
  const affected = status.components
    .filter((component) => component.status !== "operational")
    .map((component) => component.name)
    .join(", ");
  return {
    state,
    label,
    message: affected || status.description,
    checkedAt: status.checkedAt,
    statusPageUrl: STATUS_PAGE_URLS[provider]
  };
}

function notifyServiceStatusChanges(settings: AppSettings) {
  if (!Notification.isSupported() || !settings.notifications.enabled) {
    return;
  }

  const t = getTranslations(settings.language);
  const now = new Date();
  const quiet = isWithinQuietHours(settings.notifications.quietHours, now);
  for (const provider of PROVIDERS) {
    const current = latestServiceStatuses[provider.id]?.state ?? "unknown";
    const previous = rememberKnownServiceState(lastServiceStates, provider.id, current);
    if (current === "unknown") {
      continue;
    }
    if (
      !settings.providers[provider.id].visible ||
      !settings.notifications.providers[provider.id].enabled ||
      !previous ||
      previous === "unknown" ||
      current === previous ||
      quiet
    ) {
      continue;
    }
    if (current === "degraded" || current === "outage" || current === "maintenance") {
      showNotification({
        title: t.main.serviceChangeTitle(provider.label),
        body: current === "outage" ? t.main.serviceOutageBody : t.main.serviceDegradedBody
      });
    } else if (current === "operational" && previous !== "operational") {
      showNotification({
        title: t.main.serviceRecoveredTitle(provider.label),
        body: t.main.serviceRecoveredBody
      });
    }
  }
}

async function refreshServiceStatuses() {
  latestServiceStatuses = await getAllProviderServiceStatuses();
  if (latestSnapshot) {
    void refreshUsage();
  }
}

async function performUsageRefresh(generation: number): Promise<UsageSnapshot | null> {
  const settings = getSettings();
  const fetchedUsage = await fetchUsageSnapshot(settings);
  if (!usageRefreshQueue.isCurrent(generation)) {
    return null;
  }

  try {
    usageHistoryStore?.record(fetchedUsage);
  } catch (error) {
    console.warn("사용량 이력을 저장하지 못했습니다.", error);
  }
  const usage = enrichUsageWithInsights(fetchedUsage, usageHistoryStore?.getAllPoints() ?? []).map((item) => ({
    ...item,
    serviceStatus: sharedServiceStatus(item.provider, settings.language)
  }));
  const snapshot: UsageSnapshot = { settings: toPublicSettings(settings), usage };
  latestSnapshot = snapshot;
  notifyUsageEvents(snapshot);
  notifyServiceStatusChanges(settings);
  window?.webContents.send("usage:snapshot", snapshot);
  void updateTray(snapshot, generation).catch((error) => {
    console.warn("트레이 아이콘을 갱신하지 못했습니다.", error);
  });
  return snapshot;
}

async function refreshUsage(): Promise<UsageSnapshot> {
  return usageRefreshQueue.refresh();
}

function refreshAfterSettingsMutation() {
  usageRefreshQueue.invalidate();
  return refreshUsage();
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
    return refreshAfterSettingsMutation();
  });
  ipcMain.handle("settings:menu-bar-display-mode", async (_event, mode: "icons" | "iconsWithPercent") => {
    setMenuBarDisplayMode(mode);
    return refreshAfterSettingsMutation();
  });
  ipcMain.handle("settings:theme", async (_event, theme: AppSettings["theme"]) => {
    setTheme(theme);
    return refreshAfterSettingsMutation();
  });
  ipcMain.handle("settings:language", async (_event, language: AppSettings["language"]) => {
    setLanguage(language);
    return refreshAfterSettingsMutation();
  });
  ipcMain.handle("settings:refresh-interval", async (_event, intervalMs: number) => {
    setRefreshIntervalMs(intervalMs);
    restartRefreshTimer();
    return refreshAfterSettingsMutation();
  });
  ipcMain.handle("settings:notifications", async (_event, notifications: NotificationSettings) => {
    setNotificationSettings(notifications);
    return refreshAfterSettingsMutation();
  });
  ipcMain.handle("history:get", (_event, provider: ProviderId, range: UsageHistoryRange) => {
    if (!PROVIDERS.some((item) => item.id === provider) || !["24h", "7d", "30d"].includes(range)) {
      throw new Error(getTranslations(getSettings().language).main.unsupportedHistoryRequest);
    }
    return usageHistoryStore?.getProviderHistory(provider, range) ?? { provider, range, points: [] };
  });
  ipcMain.handle("provider:token-login", async (_event, payload: TokenLoginPayload) => {
    if (payload.provider !== "codex") {
      throw new Error(getTranslations(getSettings().language).main.tokenLoginCodexOnly);
    }
    setProviderToken(payload.provider, payload.token);
    return refreshAfterSettingsMutation();
  });
  ipcMain.handle("provider:oauth-login", async (_event, provider: ProviderId) => {
    const result = await startOAuthLogin(provider, getSettings().language);
    const snapshot = await refreshAfterSettingsMutation();
    return { result, snapshot };
  });
  ipcMain.handle("provider:logout", async (_event, provider: ProviderId) => {
    clearProviderAuth(provider);
    return refreshAfterSettingsMutation();
  });
  ipcMain.handle("app:quit", () => app.quit());
  ipcMain.handle("app:get-launch-at-login", () => platformAdapter.getLaunchAtLogin(app));
  ipcMain.handle("app:set-launch-at-login", (_event, enabled: boolean) => {
    platformAdapter.setLaunchAtLogin(app, enabled);
    return platformAdapter.getLaunchAtLogin(app);
  });
  ipcMain.handle("app:copy-diagnostics", async () => {
    const snapshot = latestSnapshot ?? await refreshUsage();
    clipboard.writeText(serializeDiagnosticsReport(snapshot, {
      appName: app.getName(),
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron,
      serviceStatuses: latestServiceStatuses
    }));
    return true;
  });
  ipcMain.handle("app:open-status-page", async (_event, provider: ProviderId) => {
    const statusPageUrl = STATUS_PAGE_URLS[provider];
    if (statusPageUrl) {
      await shell.openExternal(statusPageUrl);
    }
  });
  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.handle("app:get-update-status", () => getLatestUpdateStatus());
  ipcMain.handle("app:check-for-updates", () => checkForUpdates());
  ipcMain.handle("app:quit-and-install-update", () => quitAndInstallUpdate());
}

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    showWindow();
  });

  app.whenReady().then(async () => {
    if (process.platform === "win32") {
      app.setAppUserModelId("com.apg0001.aiusagewidget");
    }
    platformAdapter.hideFromDock(app);
    Menu.setApplicationMenu(null);
    registerIpc();
    usageHistoryStore = new UsageHistoryStore(path.join(app.getPath("userData"), "usage-history.json"));
    createWindow();
    tray = new Tray(await createStaticTrayIcon());
    tray.on("click", toggleWindow);
    tray.on("right-click", () => {
      const t = getTranslations(getSettings().language);
      const trayMenu = Menu.buildFromTemplate([
        { label: t.main.trayOpen, click: toggleWindow },
        { type: "separator" },
        { label: t.main.trayQuit, click: () => app.quit() }
      ]);
      tray?.popUpContextMenu(trayMenu);
    });
    void refreshUsage();
    void refreshServiceStatuses();
    serviceStatusTimer = setInterval(() => {
      void refreshServiceStatuses();
    }, 5 * 60_000);
    restartRefreshTimer();
    onUpdateStatusChange((status) => {
      window?.webContents.send("update:status", status);
    });
    initAutoUpdate();
    updateCheckTimer = setInterval(() => {
      void checkForUpdates();
    }, UPDATE_CHECK_INTERVAL_MS);
    if (process.env.AI_USAGE_WIDGET_SHOW_ON_LAUNCH) {
      setTimeout(showWindow, 500);
    }
  });
}

app.on("window-all-closed", () => {
  window = null;
});

app.on("before-quit", () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  if (serviceStatusTimer) {
    clearInterval(serviceStatusTimer);
  }
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
  }
  if (blurHideTimer) {
    clearTimeout(blurHideTimer);
  }
  destroyTrayIconRenderer();
});
