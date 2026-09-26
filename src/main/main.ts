import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  IpcMainInvokeEvent,
  Menu,
  nativeImage,
  Notification,
  screen,
  shell,
  Tray
} from "electron";
import path from "node:path";
import {
  checkForUpdates,
  getLatestUpdateStatus,
  initAutoUpdate,
  onUpdateStatusChange,
  quitAndInstallUpdate,
  revealDownloadedUpdate
} from "./appUpdater.js";
import { serializeDiagnosticsReport } from "./diagnostics.js";
import { GenerationRefreshQueue } from "./generationRefreshQueue.js";
import { getTranslations } from "../shared/i18n.js";
import { attachPanelAutoHideWindowEvents, PanelAutoHideController } from "./panelAutoHide.js";
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
  setMeterColorBands,
  setNotificationSettings,
  setRefreshIntervalMs,
  setProviderToken,
  setProviderVisibility,
  setTheme,
  toPublicSettings
} from "./settingsStore.js";
import { buildStaticTrayIconSvg, buildUsageTrayIconSvg, TRAY_ICON_RENDER_SIZE } from "./trayIcon.js";
import { destroyTrayIconRenderer, renderSvgToNativeImage } from "./trayIconRenderer.js";
import { createFallbackTrayIcon } from "./trayIconFallback.js";
import { getTrayTitle } from "./trayTitle.js";
import { UsageHistoryStore } from "./usageHistoryStore.js";
import { configurePlanCache } from "./planCacheStore.js";
import {
  clampPanelHeight,
  MAX_PANEL_HEIGHT,
  PANEL_WIDTH
} from "./panelGeometry.js";
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
const showOnLaunch = process.env.AI_USAGE_WIDGET_SHOW_ON_LAUNCH === "1";
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

let tray: Tray | null = null;
let window: BrowserWindow | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let serviceStatusTimer: ReturnType<typeof setInterval> | null = null;
let updateCheckTimer: ReturnType<typeof setInterval> | null = null;
let panelAutoHide: PanelAutoHideController | null = null;
let detachPanelAutoHideWindowEvents: (() => void) | null = null;
let panelFocusRetryTimer: ReturnType<typeof setTimeout> | null = null;
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

// 패널은 내용 높이에 맞춰 줄어든다. 제공자를 하나만 켜두면 카드 하나 높이로 붙고,
// 세 개를 다 켜거나 상세 화면처럼 길어지면 상한까지만 커지고 그 안에서 스크롤한다.
// 렌더러가 레이아웃마다 높이를 보고하므로 프레임 단위로 합쳐서 한 번만 적용한다.
const PANEL_HEIGHT_COALESCE_MS = 16;
let requestedPanelHeight: number | null = null;
let lastAppliedPanelHeight: number | null = null;
let pendingPanelHeight: number | null = null;
let panelHeightTimer: ReturnType<typeof setTimeout> | null = null;

function assertTrustedIpcSender(event: IpcMainInvokeEvent) {
  const panel = window;
  if (!panel || panel.isDestroyed() || event.sender !== panel.webContents) {
    throw new Error("IPC request rejected from an untrusted renderer.");
  }
}

function registerTrustedIpc<Args extends unknown[], Result>(
  channel: string,
  listener: (...args: Args) => Result | Promise<Result>
) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedIpcSender(event);
    return listener(...(args as Args));
  });
}

function hardenRendererWindow(panel: BrowserWindow) {
  panel.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  panel.webContents.on("will-navigate", (event) => event.preventDefault());
  panel.webContents.on("will-attach-webview", (event) => event.preventDefault());
  panel.webContents.session.setPermissionCheckHandler(() => false);
  panel.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
}

function showWindow() {
  const panel = window;
  if (!panel || panel.isDestroyed()) {
    return;
  }

  const wasVisible = panel.isVisible();
  if (!wasVisible) {
    panelAutoHide?.prepareForShow();
  }
  if (panelFocusRetryTimer) {
    clearTimeout(panelFocusRetryTimer);
    panelFocusRetryTimer = null;
  }
  positionWindow();
  panel.show();
  panel.focus();
  panel.moveTop();

  if (!wasVisible) {
    panelFocusRetryTimer = setTimeout(() => {
      panelFocusRetryTimer = null;
      if (
        window === panel &&
        !panel.isDestroyed() &&
        panel.isVisible() &&
        panelAutoHide?.needsFocusRetry()
      ) {
        const autoHide = panelAutoHide;
        const focusLossSequence = autoHide?.getFocusLossSequence();
        const previouslyFocused = panel.isFocused();
        panel.focus();
        panel.moveTop();
        if (focusLossSequence !== undefined) {
          autoHide?.confirmFocusRetry(previouslyFocused, focusLossSequence);
        }
      }
    }, 0);
  }
}

async function createStaticTrayIcon() {
  if (platformAdapter.id === "mac") {
    // macOS는 Tray.setTitle로 에이전트별 이름/사용률 텍스트만 보여주면 충분하고,
    // 아이콘 비트맵(숨겨진 창을 캡처하는 방식)은 투명 배경이 온전히 보존되지 않아
    // 메뉴바에 불필요한 흰 여백 블록으로 보이는 문제가 있어 아이콘 자체를 비워둔다.
    return nativeImage.createEmpty();
  }
  try {
    const image = await renderSvgToNativeImage(buildStaticTrayIconSvg(), 32);
    image.setTemplateImage(true);
    return image;
  } catch {
    // 아이콘을 못 그려도 트레이 자체는 떠야 한다. 여기서 예외가 밖으로 나가면 whenReady
    // 핸들러가 그 자리에서 끝나 트레이 클릭 핸들러, 갱신 타이머, 서비스 상태 폴링,
    // 자동 업데이트가 하나도 등록되지 않는다. 빈 이미지를 넘기면 리눅스 인디케이터가
    // 보이지 않아 앱에 접근할 방법이 사라지므로 내장 PNG를 대신 쓴다.
    return createFallbackTrayIcon();
  }
}

function createWindow() {
  window = new BrowserWindow({
    width: PANEL_WIDTH,
    height: MAX_PANEL_HEIGHT,
    ...(platformAdapter.id === "mac" ? { type: "panel" } : {}),
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
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev
    }
  });

  const panelWindow = window;
  hardenRendererWindow(panelWindow);
  detachPanelAutoHideWindowEvents?.();
  panelAutoHide = new PanelAutoHideController(
    () => (window === panelWindow ? panelWindow : null),
    { showGraceMs: platformAdapter.id === "windows" ? 350 : 0 }
  );
  detachPanelAutoHideWindowEvents = attachPanelAutoHideWindowEvents(panelWindow, panelAutoHide);

  window.once("ready-to-show", () => {
    if (showOnLaunch) {
      showWindow();
    }
  });

  window.webContents.on("before-input-event", (_event, input) => {
    const isDevToolsShortcut = input.type === "keyDown" && (
      input.key === "F12" ||
      (input.control && input.shift && (input.key === "I" || input.key === "i"))
    );
    if (isDev && isDevToolsShortcut) {
      window?.webContents.toggleDevTools();
    }
  });

  window.webContents.once("did-finish-load", () => {
    if (showOnLaunch && !window?.isVisible()) {
      showWindow();
    }
  });

  if (isDev) {
    void window.loadURL("http://127.0.0.1:5173");
  } else {
    void window.loadFile(getRendererIndexPath(__dirname));
  }

  lastAppliedPanelHeight = null;
  panelWindow.once("closed", () => {
    if (window !== panelWindow) {
      return;
    }
    if (panelFocusRetryTimer) {
      clearTimeout(panelFocusRetryTimer);
      panelFocusRetryTimer = null;
    }
    detachPanelAutoHideWindowEvents = null;
    panelAutoHide = null;
    window = null;
  });
}

function showNotification(options: Electron.NotificationConstructorOptions) {
  const notification = new Notification(options);
  notification.show();
}

function resizePanel(panel: BrowserWindow, height: number) {
  // getSize를 되읽으면 분수 배율(125%)에서 반올림 때문에 값이 어긋나 매번 다시 적용된다.
  if (lastAppliedPanelHeight === height) {
    return;
  }

  // 윈도우와 리눅스는 resizable: false인 창의 setSize를 무시한다(내부적으로 최소=최대
  // 크기를 현재 크기로 고정해둔다). 크기를 바꾸는 순간에만 잠깐 풀었다 되돌린다.
  // macOS에는 그 제약이 없고, 토글이 panel 타입 창의 styleMask를 건드리므로 건너뛴다.
  const needsResizableToggle = platformAdapter.id !== "mac" && !panel.isResizable();
  if (needsResizableToggle) {
    panel.setResizable(true);
  }
  panel.setSize(PANEL_WIDTH, height, false);
  if (needsResizableToggle) {
    panel.setResizable(false);
  }
  lastAppliedPanelHeight = height;
}

// 패널은 트레이 아이콘에 붙는다. 커서가 있는 디스플레이를 쓰면 마우스를 옆 모니터로
// 옮긴 사이에 높이 보고가 오는 순간 패널이 트레이와 떨어진 화면으로 튄다.
// 리눅스에서 Tray.getBounds()는 지원되지 않아 0으로 채운 사각형을 돌려준다. 객체 자체는
// truthy라 존재 여부만 보면 폴백이 영영 걸리지 않으므로 실제 크기가 있는지로 판단한다.
function usableTrayBounds() {
  const bounds = tray?.getBounds();
  return bounds && bounds.width > 0 && bounds.height > 0 ? bounds : null;
}

function panelDisplay() {
  const trayBounds = usableTrayBounds();
  if (trayBounds) {
    return screen.getDisplayNearestPoint({
      x: Math.round(trayBounds.x + trayBounds.width / 2),
      y: Math.round(trayBounds.y + trayBounds.height / 2)
    });
  }
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function applyPanelHeight(height: number) {
  const panel = window;
  if (!panel || panel.isDestroyed() || !Number.isFinite(height)) {
    return;
  }

  requestedPanelHeight = height;
  if (!panel.isVisible()) {
    // 숨어 있을 때는 크기만 맞춰두면 된다. 위치는 다음에 열 때 어차피 다시 잡는다.
    resizePanel(panel, clampPanelHeight(height, panelDisplay().workArea));
    return;
  }
  // 높이가 바뀌면 트레이 기준 위치도 다시 잡아야 패널이 화면 밖으로 나가지 않는다.
  positionWindow();
}

// 렌더러가 레이아웃마다 보고하므로(악의적인 렌더러라면 더 자주) 한 프레임 안의 보고를
// 모아 마지막 값만 적용한다. 적용 한 번에 동기 OS 호출이 여러 번 일어난다.
function requestPanelHeight(height: number) {
  if (!Number.isFinite(height)) {
    return;
  }

  pendingPanelHeight = height;
  if (panelHeightTimer) {
    return;
  }
  panelHeightTimer = setTimeout(() => {
    panelHeightTimer = null;
    const next = pendingPanelHeight;
    pendingPanelHeight = null;
    if (next !== null) {
      applyPanelHeight(next);
    }
  }, PANEL_HEIGHT_COALESCE_MS);
}

function positionWindow() {
  if (!window) {
    return;
  }

  const workArea = panelDisplay().workArea;
  const preferredHeight = clampPanelHeight(requestedPanelHeight ?? MAX_PANEL_HEIGHT, workArea);
  resizePanel(window, preferredHeight);
  const windowBounds = window.getBounds();
  const trayBounds = usableTrayBounds();
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

function buildTrayMenu() {
  const t = getTranslations(getSettings().language);
  return Menu.buildFromTemplate([
    { label: t.main.trayOpen, click: toggleWindow },
    { type: "separator" },
    { label: t.main.trayQuit, click: () => app.quit() }
  ]);
}

function applyLinuxTrayContextMenu() {
  // AppIndicator/StatusNotifierItem 기반 리눅스 트레이(GNOME, KDE Plasma 등)는 컨텍스트 메뉴가
  // 상시 등록돼 있어야 클릭에 반응한다. 메뉴가 없으면 click/right-click 이벤트 자체가 오지 않아
  // 아이콘은 보이지만 클릭이 아무 반응도 하지 않는 것처럼 보인다.
  if (platformAdapter.id === "linux") {
    tray?.setContextMenu(buildTrayMenu());
  }
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
  tray?.setToolTip(`GigaCharge\n${getTrayTitle(snapshot)}`);
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
  registerTrustedIpc("usage:get", async () => latestSnapshot ?? refreshUsage());
  registerTrustedIpc("usage:refresh", async () => refreshUsage());
  registerTrustedIpc("provider:visibility", async (provider: ProviderId, visible: boolean) => {
    setProviderVisibility(provider, visible);
    restartRefreshTimer();
    return refreshAfterSettingsMutation();
  });
  registerTrustedIpc("settings:menu-bar-display-mode", async (mode: "icons" | "iconsWithPercent") => {
    setMenuBarDisplayMode(mode);
    return refreshAfterSettingsMutation();
  });
  registerTrustedIpc("settings:theme", async (theme: AppSettings["theme"]) => {
    setTheme(theme);
    return refreshAfterSettingsMutation();
  });
  registerTrustedIpc("settings:language", async (language: AppSettings["language"]) => {
    setLanguage(language);
    applyLinuxTrayContextMenu();
    return refreshAfterSettingsMutation();
  });
  registerTrustedIpc("settings:meter-color-bands", async (bands: AppSettings["meterColorBands"]) => {
    setMeterColorBands(bands);
    return refreshAfterSettingsMutation();
  });
  registerTrustedIpc("settings:refresh-interval", async (intervalMs: number) => {
    setRefreshIntervalMs(intervalMs);
    restartRefreshTimer();
    return refreshAfterSettingsMutation();
  });
  registerTrustedIpc("settings:notifications", async (notifications: NotificationSettings) => {
    setNotificationSettings(notifications);
    return refreshAfterSettingsMutation();
  });
  registerTrustedIpc("history:get", (provider: ProviderId, range: UsageHistoryRange) => {
    if (!PROVIDERS.some((item) => item.id === provider) || !["24h", "7d", "30d"].includes(range)) {
      throw new Error(getTranslations(getSettings().language).main.unsupportedHistoryRequest);
    }
    return usageHistoryStore?.getProviderHistory(provider, range) ?? { provider, range, points: [] };
  });
  registerTrustedIpc("provider:token-login", async (payload: TokenLoginPayload) => {
    if (payload.provider !== "codex") {
      throw new Error(getTranslations(getSettings().language).main.tokenLoginCodexOnly);
    }
    setProviderToken(payload.provider, payload.token);
    return refreshAfterSettingsMutation();
  });
  registerTrustedIpc("provider:oauth-login", async (provider: ProviderId) => {
    const result = await startOAuthLogin(provider, getSettings().language);
    const snapshot = await refreshAfterSettingsMutation();
    return { result, snapshot };
  });
  registerTrustedIpc("provider:logout", async (provider: ProviderId) => {
    clearProviderAuth(provider);
    return refreshAfterSettingsMutation();
  });
  registerTrustedIpc("app:quit", () => app.quit());
  registerTrustedIpc("app:hide-window", () => {
    window?.hide();
  });
  registerTrustedIpc("app:get-launch-at-login", () => platformAdapter.getLaunchAtLogin(app));
  registerTrustedIpc("app:set-launch-at-login", (enabled: boolean) => {
    platformAdapter.setLaunchAtLogin(app, enabled);
    return platformAdapter.getLaunchAtLogin(app);
  });
  registerTrustedIpc("app:copy-diagnostics", async () => {
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
  registerTrustedIpc("app:copy-text", (text: string) => {
    clipboard.writeText(text);
    return true;
  });
  registerTrustedIpc("app:open-status-page", async (provider: ProviderId) => {
    const statusPageUrl = STATUS_PAGE_URLS[provider];
    if (statusPageUrl) {
      await shell.openExternal(statusPageUrl);
    }
  });
  registerTrustedIpc("window:panel-height", (height: number) => {
    requestPanelHeight(height);
  });
  registerTrustedIpc("app:get-version", () => app.getVersion());
  registerTrustedIpc("app:get-update-status", () => getLatestUpdateStatus());
  registerTrustedIpc("app:check-for-updates", () => checkForUpdates());
  registerTrustedIpc("app:quit-and-install-update", () => quitAndInstallUpdate());
  registerTrustedIpc("app:reveal-downloaded-update", () => revealDownloadedUpdate());
  registerTrustedIpc("app:restart", () => {
    // 수동 설치는 새 파일이 이미 디스크에 깔려 있어도 실행 중인 프로세스는
    // 옛 버전 그대로다. 새 실행 파일로 다시 뜨려면 `relaunch`가 필요하다.
    app.relaunch();
    app.exit(0);
  });
}

if (hasSingleInstanceLock) {
  if (platformAdapter.id === "mac") {
    app.on("did-resign-active", () => panelAutoHide?.handleFocusLost());
  }

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
    configurePlanCache(app.getPath("userData"));
    usageHistoryStore = new UsageHistoryStore(path.join(app.getPath("userData"), "usage-history.json"));
    createWindow();
    tray = new Tray(await createStaticTrayIcon());
    tray.on("click", toggleWindow);
    tray.on("right-click", () => {
      tray?.popUpContextMenu(buildTrayMenu());
    });
    applyLinuxTrayContextMenu();
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
    if (showOnLaunch) {
      setTimeout(showWindow, 500);
    }
  });
}

app.on("window-all-closed", () => {
  detachPanelAutoHideWindowEvents?.();
  detachPanelAutoHideWindowEvents = null;
  panelAutoHide = null;
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
  if (panelFocusRetryTimer) {
    clearTimeout(panelFocusRetryTimer);
    panelFocusRetryTimer = null;
  }
  detachPanelAutoHideWindowEvents?.();
  detachPanelAutoHideWindowEvents = null;
  panelAutoHide = null;
  destroyTrayIconRenderer();
});
