import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { getTranslations } from "../shared/i18n.js";
import { UpdateStatus } from "../shared/types.js";
import { getSettings } from "./settingsStore.js";

type UpdateStatusListener = (status: UpdateStatus) => void;

let listener: UpdateStatusListener | null = null;
let latestStatus: UpdateStatus = { state: "idle" };
let initialized = false;

function emit(status: UpdateStatus) {
  latestStatus = status;
  listener?.(status);
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
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => emit({ state: "checking" }));
  autoUpdater.on("update-available", (info) => emit({ state: "available", version: info.version }));
  autoUpdater.on("update-not-available", (info) => emit({ state: "not-available", version: info.version }));
  autoUpdater.on("download-progress", (progress) => emit({ state: "downloading", progressPercent: Math.round(progress.percent) }));
  autoUpdater.on("update-downloaded", (info) => emit({ state: "downloaded", version: info.version }));
  autoUpdater.on("error", (error) => {
    emit({ state: "error", message: error instanceof Error ? error.message : String(error) });
  });

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
    emit({ state: "error", message: error instanceof Error ? error.message : String(error) });
  }
}

export function quitAndInstallUpdate() {
  autoUpdater.quitAndInstall();
}
