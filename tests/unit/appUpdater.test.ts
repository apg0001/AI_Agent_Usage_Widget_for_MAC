import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updaterMock = vi.hoisted(() => {
  const handlers = new Map<string, (value?: unknown) => void>();
  const checkForUpdates = vi.fn();
  const quitAndInstall = vi.fn();
  const on = vi.fn((event: string, handler: (value?: unknown) => void) => {
    handlers.set(event, handler);
  });

  return {
    handlers,
    checkForUpdates,
    quitAndInstall,
    on,
    autoUpdater: {
      autoDownload: false,
      autoInstallOnAppQuit: false,
      on,
      checkForUpdates,
      quitAndInstall
    }
  };
});

const shellMock = vi.hoisted(() => ({
  showItemInFolder: vi.fn()
}));

vi.mock("electron", () => ({
  app: { isPackaged: true },
  shell: shellMock
}));

vi.mock("electron-updater", () => ({
  autoUpdater: updaterMock.autoUpdater
}));

vi.mock("../../src/main/settingsStore", () => ({
  getSettings: () => ({ language: "ko" })
}));

const originalPlatform = process.platform;
const originalAppImage = process.env.APPIMAGE;

describe("앱 업데이트 오류 경계", () => {
  beforeEach(() => {
    vi.resetModules();
    updaterMock.handlers.clear();
    updaterMock.on.mockClear();
    updaterMock.checkForUpdates.mockReset().mockResolvedValue(undefined);
    updaterMock.quitAndInstall.mockClear();
    updaterMock.autoUpdater.autoDownload = false;
    updaterMock.autoUpdater.autoInstallOnAppQuit = false;
    shellMock.showItemInFolder.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: originalPlatform
    });
    if (originalAppImage === undefined) {
      delete process.env.APPIMAGE;
    } else {
      process.env.APPIMAGE = originalAppImage;
    }
  });

  it("Linux deb 설치본은 자동 설치를 끄고 안전한 수동 명령만 제공한다", async () => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "linux"
    });
    delete process.env.APPIMAGE;

    const updater = await import("../../src/main/appUpdater");
    const listener = vi.fn();
    updater.onUpdateStatusChange(listener);
    updater.initAutoUpdate();

    expect(updaterMock.autoUpdater.autoDownload).toBe(true);
    expect(updaterMock.autoUpdater.autoInstallOnAppQuit).toBe(false);

    updaterMock.handlers.get("update-downloaded")?.({
      version: "0.4.3",
      downloadedFile: "/tmp/GigaCharge update's.deb"
    });

    expect(listener).toHaveBeenLastCalledWith({
      state: "downloaded",
      version: "0.4.3",
      manualInstallCommand: "sudo apt install -y '/tmp/GigaCharge update'\\''s.deb'"
    });

    updater.quitAndInstallUpdate();
    expect(updaterMock.quitAndInstall).not.toHaveBeenCalled();
  });

  it("deb 외 리눅스 패키지에도 해당 패키지 관리자 명령을 안내한다", async () => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "linux"
    });
    delete process.env.APPIMAGE;

    const updater = await import("../../src/main/appUpdater");
    updater.initAutoUpdate();

    updaterMock.handlers.get("update-downloaded")?.({
      version: "0.4.3",
      downloadedFile: "/tmp/GigaCharge.rpm"
    });
    expect(updater.getLatestUpdateStatus()).toMatchObject({
      manualInstallCommand: "sudo rpm -U '/tmp/GigaCharge.rpm'"
    });

    updaterMock.handlers.get("update-downloaded")?.({
      version: "0.4.3",
      downloadedFile: "/tmp/GigaCharge.pacman"
    });
    expect(updater.getLatestUpdateStatus()).toMatchObject({
      manualInstallCommand: "sudo pacman -U '/tmp/GigaCharge.pacman'"
    });
  });

  it("Linux AppImage는 기존 자동 설치 경로를 유지한다", async () => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "linux"
    });
    process.env.APPIMAGE = "/opt/GigaCharge.AppImage";

    const updater = await import("../../src/main/appUpdater");
    updater.initAutoUpdate();

    expect(updaterMock.autoUpdater.autoInstallOnAppQuit).toBe(true);

    updaterMock.handlers.get("update-downloaded")?.({
      version: "0.4.3",
      downloadedFile: "/tmp/GigaCharge.AppImage"
    });
    expect(updater.getLatestUpdateStatus()).toMatchObject({
      state: "downloaded",
      version: "0.4.3",
      manualInstallCommand: undefined
    });

    updater.quitAndInstallUpdate();
    expect(updaterMock.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it("macOS는 미서명 빌드라 자동 설치를 끄고 다운로드된 zip 경로만 안내한다", async () => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "darwin"
    });

    const updater = await import("../../src/main/appUpdater");
    const listener = vi.fn();
    updater.onUpdateStatusChange(listener);
    updater.initAutoUpdate();

    expect(updaterMock.autoUpdater.autoDownload).toBe(true);
    expect(updaterMock.autoUpdater.autoInstallOnAppQuit).toBe(false);

    updaterMock.handlers.get("update-downloaded")?.({
      version: "0.4.3",
      downloadedFile: "/tmp/update.zip"
    });

    expect(listener).toHaveBeenLastCalledWith({
      state: "downloaded",
      version: "0.4.3",
      manualInstallCommand: undefined,
      manualInstallPath: "/tmp/update.zip"
    });

    updater.quitAndInstallUpdate();
    expect(updaterMock.quitAndInstall).not.toHaveBeenCalled();

    updater.revealDownloadedUpdate();
    expect(shellMock.showItemInFolder).toHaveBeenCalledWith("/tmp/update.zip");
  });

  it("autoUpdater error 이벤트에서 원문·스택·비밀값을 renderer 상태로 보내지 않는다", async () => {
    const updater = await import("../../src/main/appUpdater");
    const listener = vi.fn();
    updater.onUpdateStatusChange(listener);
    updater.initAutoUpdate();

    const raw = Object.assign(new Error("Cannot find latest.yml secret=SENTINEL\n    at private/path"), {
      code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND"
    });
    updaterMock.handlers.get("error")?.(raw);

    expect(listener).toHaveBeenLastCalledWith({
      state: "error",
      errorCode: "metadata-missing",
      diagnosticCode: "UPDATE_METADATA_MISSING"
    });
    expect(JSON.stringify(updater.getLatestUpdateStatus())).not.toContain("SENTINEL");
    expect(JSON.stringify(updater.getLatestUpdateStatus())).not.toContain("private/path");
  });

  it("checkForUpdates rejection도 같은 정제된 상태만 저장한다", async () => {
    updaterMock.checkForUpdates.mockRejectedValueOnce(
      Object.assign(new Error("Bearer SENTINEL"), { code: "ENOTFOUND" })
    );
    const updater = await import("../../src/main/appUpdater");
    const listener = vi.fn();
    updater.onUpdateStatusChange(listener);

    await updater.checkForUpdates();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(updater.getLatestUpdateStatus()).toEqual({
      state: "error",
      errorCode: "network",
      diagnosticCode: "UPDATE_NETWORK"
    });
  });

  it("동일 실패의 error 이벤트와 promise rejection을 연속으로 중복 표시하지 않는다", async () => {
    const updater = await import("../../src/main/appUpdater");
    const listener = vi.fn();
    updater.onUpdateStatusChange(listener);
    updater.initAutoUpdate();
    await Promise.resolve();
    listener.mockClear();

    const failure = Object.assign(new Error("Cannot find latest.yml"), {
      code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND"
    });
    updaterMock.handlers.get("error")?.(failure);
    updaterMock.checkForUpdates.mockRejectedValueOnce(failure);
    await updater.checkForUpdates();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
