import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("macOS/Windows 공통 런타임", () => {
  it("하나의 BrowserWindow가 같은 renderer 진입 경로를 사용한다", () => {
    const main = source("src/main/main.ts");
    const rendererPath = source("src/main/rendererPath.ts");

    expect(main.match(/new BrowserWindow\(/g)).toHaveLength(1);
    expect(main).toContain('window.loadURL("http://127.0.0.1:5173")');
    expect(main).toContain("window.loadFile(getRendererIndexPath(__dirname))");
    expect(rendererPath).toContain('path.join(mainDirname, "../../renderer/index.html")');
  });

  it("플랫폼 어댑터는 OS 기능만 분리하고 앱 로직은 main에 하나로 유지한다", () => {
    const main = source("src/main/main.ts");
    const platformIndex = source("src/main/platform/index.ts");
    const mac = source("src/main/platform/mac.ts");
    const windows = source("src/main/platform/windows.ts");

    expect(platformIndex).toContain('platform === "darwin"');
    expect(platformIndex).toContain('platform === "win32"');
    expect(main).toContain("platformAdapter.hideFromDock(app)");
    expect(main).toContain('app.setAppUserModelId("com.apg0001.aiusagewidget")');
    expect(main).toContain("registerIpc()");
    expect(main).toContain("usageHistoryStore = new UsageHistoryStore");
    expect(main).toContain("createWindow()");
    expect(main).toContain("void refreshUsage()");
    expect(main).toContain("void refreshServiceStatuses()");

    for (const adapter of [mac, windows]) {
      expect(adapter).not.toContain("BrowserWindow");
      expect(adapter).not.toContain("ipcMain");
      expect(adapter).not.toContain("UsageNotificationDetector");
      expect(adapter).not.toContain("UsageHistoryStore");
    }
  });

  it("트레이 표시 방식만 OS에 맞게 다르고 동일한 snapshot을 사용한다", () => {
    const main = source("src/main/main.ts");

    expect(main).toContain('if (platformAdapter.id === "mac")');
    expect(main).toContain("tray?.setTitle(getTrayTitle(snapshot))");
    expect(main).toContain("buildUsageTrayIconSvg(snapshot)");
    expect(main).toContain("tray?.setToolTip(`GigaCharge\\n${getTrayTitle(snapshot)}`)");
  });
});
