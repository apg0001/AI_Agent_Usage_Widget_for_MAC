import { app, shell } from "electron";
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

// macOS 빌드는 코드사이닝/공증 없이 배포되는데, electron-updater의 mac 설치 단계(Squirrel.Mac)는
// 실행 중인 앱과 새 번들의 서명이 일치해야만 자동 설치를 진행한다. 다운로드 자체는 서명 검증 없이
// 일반 HTTPS로 이뤄지므로, 설치만 건너뛰고 받아둔 zip 위치를 안내해 사용자가 직접 교체하게 한다.
const isMacManualInstall = process.platform === "darwin";
const isManualInstall = isLinuxManualInstall || isMacManualInstall;

function quoteShellPath(filePath: string): string {
  return `'${filePath.replace(/'/g, "'\\''")}'`;
}

function buildManualInstallCommand(downloadedFile: string): string {
  const target = quoteShellPath(downloadedFile);
  if (downloadedFile.endsWith(".rpm")) {
    return `sudo rpm -U ${target}`;
  }
  if (downloadedFile.endsWith(".pacman")) {
    return `sudo pacman -U ${target}`;
  }
  // apt는 dpkg와 달리 새로 추가된 의존성까지 함께 설치해 준다.
  return `sudo apt install -y ${target}`;
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
  // 수동 설치 케이스(리눅스 root 필요 조합, macOS 미서명 빌드)는 앱 종료 시점에도
  // 설치를 자동으로 걸지 않는다(위 주석 참고).
  autoUpdater.autoInstallOnAppQuit = !isManualInstall;

  autoUpdater.on("checking-for-update", () => emit({ state: "checking" }));
  autoUpdater.on("update-available", (info) => emit({ state: "available", version: info.version }));
  autoUpdater.on("update-not-available", (info) => emit({ state: "not-available", version: info.version }));
  autoUpdater.on("download-progress", (progress) => emit({ state: "downloading", progressPercent: Math.round(progress.percent) }));
  autoUpdater.on("update-downloaded", (info) => emit({
    state: "downloaded",
    version: info.version,
    manualInstallCommand: isLinuxManualInstall ? buildManualInstallCommand(info.downloadedFile) : undefined,
    manualInstallPath: isMacManualInstall ? info.downloadedFile : undefined
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
  if (isManualInstall) {
    // 리눅스는 pkexec가 세션에 따라 응답 없이 멈출 수 있고, macOS는 미서명 빌드라
    // Squirrel.Mac이 자동 설치를 거부한다. 설치 안내는 update-downloaded 시점에
    // 이미 manualInstallCommand/manualInstallPath로 전달했다.
    return;
  }
  autoUpdater.quitAndInstall();
}

export function revealDownloadedUpdate() {
  const path = latestStatus.state === "downloaded" ? latestStatus.manualInstallPath : undefined;
  if (path) {
    shell.showItemInFolder(path);
  }
}
