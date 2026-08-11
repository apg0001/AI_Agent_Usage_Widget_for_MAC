import { beforeEach, describe, expect, it, vi } from "vitest";

const updaterMock = vi.hoisted(() => ({
  handlers: new Map<string, (value?: unknown) => void>(),
  checkForUpdates: vi.fn(),
  quitAndInstall: vi.fn(),
  on: vi.fn((event: string, handler: (value?: unknown) => void) => {
    updaterMock.handlers.set(event, handler);
  })
}));

vi.mock("electron", () => ({
  app: { isPackaged: true }
}));

vi.mock("electron-updater", () => ({
  autoUpdater: {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on: updaterMock.on,
    checkForUpdates: updaterMock.checkForUpdates,
    quitAndInstall: updaterMock.quitAndInstall
  }
}));

vi.mock("../../src/main/settingsStore", () => ({
  getSettings: () => ({ language: "ko" })
}));

describe("앱 업데이트 오류 경계", () => {
  beforeEach(() => {
    vi.resetModules();
    updaterMock.handlers.clear();
    updaterMock.on.mockClear();
    updaterMock.checkForUpdates.mockReset().mockResolvedValue(undefined);
    updaterMock.quitAndInstall.mockClear();
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
