import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { getTranslations } from "../shared/i18n.js";
import { UpdateStatus } from "../shared/types.js";
import { getSettings } from "./settingsStore.js";
import { normalizeUpdateError } from "./updateError.js";

type UpdateStatusListener = (status: UpdateStatus) => void;

let listener: UpdateStatusListener | null = null;
let latestStatus: UpdateStatus = { state: "idle" };
let initialized = false;
let lastErrorKey = "";
let lastErrorAt = 0;

// deb/rpm 설치본은 새 버전을 적용하려면 pkexec로 root 권한을 얻어야 한다. GUI polkit
// 인증 에이전트가 없는 세션(미니멀 WM, 일부 원격 데스크톱 등)에서는 pkexec가 응답을
// 영원히 기다리며 앱 전체가 멈춰버리므로, 이 조합에서는 자동 설치를 아예 시도하지
// 않고 사용자가 직접 실행할 수 있는 설치 명령을 안내한다. AppImage는 파일 자체를
// 사용자 권한으로 교체하는 방식이라 root가 필요 없어 해당 없음(APPIMAGE 환경 변수로 판별).
const isLinuxManualInstall = process.platform === "linux" && !process.env.APPIMAGE;

function quoteShellPath(filePath: string): string {
  return `'${filePath.replace(/'/g, "'\\''")}'`;
}

function emit(status: UpdateStatus) {
  if (status.state !== "error") {
    lastErrorKey = "";
    lastErrorAt = 0;
  }
  latestStatus = status;
  listener?.(status);
}

function emitError(error: unknown) {
  const normalized = normalizeUpdateError(error);
  const key = `${normalized.errorCode}:${normalized.diagnosticCode}`;
  const now = Date.now();
  if (key === lastErrorKey && now - lastErrorAt < 1_000) {
    return;
  }
  lastErrorKey = key;
  lastErrorAt = now;
  emit({ state: "error", ...normalized });
}

export function getLatestUpdateStatus(): UpdateStatus {
  return latestStatus;
}

export function onUpdateStatusChange(callback: UpdateStatusListener) {
  listener = callback;
}

export function initAutoUpdate() {
  if (initialized || !app.isPackaged) {
    return;
  }
  initialized = true;

  autoUpdater.autoDownload = true;
  // 리눅스 수동 설치 케이스는 앱 종료 시점에도 pkexec를 자동으로 걸지 않는다(위 주석 참고).
  autoUpdater.autoInstallOnAppQuit = !isLinuxManualInstall;

  autoUpdater.on("checking-for-update", () => emit({ state: "checking" }));
  autoUpdater.on("update-available", (info) => emit({ state: "available", version: info.version }));
  autoUpdater.on("update-not-available", (info) => emit({ state: "not-available", version: info.version }));
  autoUpdater.on("download-progress", (progress) => emit({ state: "downloading", progressPercent: Math.round(progress.percent) }));
  autoUpdater.on("update-downloaded", (info) => emit({
    state: "downloaded",
    version: info.version,
    manualInstallCommand: isLinuxManualInstall ? `sudo dpkg -i ${quoteShellPath(info.downloadedFile)}` : undefined
  }));
  autoUpdater.on("error", emitError);

  void checkForUpdates();
}

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    const t = getTranslations(getSettings().language);
    emit({ state: "not-available", message: t.updates.devModeNote });
    return;
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    emitError(error);
  }
}

export function quitAndInstallUpdate() {
  if (isLinuxManualInstall) {
    // pkexec가 이 세션에서 응답 없이 멈출 수 있어 자동 설치를 걸지 않는다. 설치 안내는
    // update-downloaded 시점에 이미 manualInstallCommand로 전달했다.
    return;
  }
  autoUpdater.quitAndInstall();
}
