import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Electron 런타임 설정", () => {
  it("main/preload 산출물이 CommonJS로 빌드되도록 설정한다", () => {
    const tsconfig = readFileSync(resolve(process.cwd(), "tsconfig.json"), "utf8");
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      type?: string;
      scripts: Record<string, string>;
    };

    expect(tsconfig).toContain('"module": "CommonJS"');
    expect(packageJson.type).toBeUndefined();
    expect(packageJson.scripts.dev).toContain("node scripts/dev-electron.js");
  });

  it("ELECTRON_RUN_AS_NODE 해제를 Windows cmd.exe에서도 동작하는 방식으로 처리한다", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const devElectronScript = readFileSync(resolve(process.cwd(), "scripts/dev-electron.js"), "utf8");

    expect(packageJson.scripts.dev).not.toContain("env -u ELECTRON_RUN_AS_NODE");
    expect(devElectronScript).toContain("delete env.ELECTRON_RUN_AS_NODE");
  });

  it("창 표시 안정성을 위해 테스트용 즉시 표시 옵션과 불투명 배경을 사용한다", () => {
    const main = readFileSync(resolve(process.cwd(), "src/main/main.ts"), "utf8");

    expect(main).toContain("AI_USAGE_WIDGET_SHOW_ON_LAUNCH");
    expect(main).toContain("transparent: false");
    expect(main).toContain('backgroundColor: "#f8fafc"');
  });

  it("OAuth 브라우저 로그인 IPC를 제공한다", () => {
    const main = readFileSync(resolve(process.cwd(), "src/main/main.ts"), "utf8");
    const preload = readFileSync(resolve(process.cwd(), "src/preload/preload.ts"), "utf8");

    expect(main).toContain('"provider:oauth-login"');
    expect(preload).toContain("oauthLogin");
  });

  it("토큰 로그인 IPC를 제공한다", () => {
    const main = readFileSync(resolve(process.cwd(), "src/main/main.ts"), "utf8");
    const preload = readFileSync(resolve(process.cwd(), "src/preload/preload.ts"), "utf8");

    expect(main).toContain('"provider:token-login"');
    expect(preload).toContain("tokenLogin");
  });

  it("메뉴바 표시 모드 설정 IPC를 제공한다", () => {
    const main = readFileSync(resolve(process.cwd(), "src/main/main.ts"), "utf8");
    const preload = readFileSync(resolve(process.cwd(), "src/preload/preload.ts"), "utf8");

    expect(main).toContain('"settings:menu-bar-display-mode"');
    expect(preload).toContain("setMenuBarDisplayMode");
  });

  it("사용량 갱신을 직렬화하고 스마트 알림과 이력을 연결한다", () => {
    const main = readFileSync(resolve(process.cwd(), "src/main/main.ts"), "utf8");

    expect(main).toContain("GenerationRefreshQueue");
    expect(main).toContain("refreshAfterSettingsMutation");
    expect(main).toContain("toPublicSettings(settings)");
    expect(main).toContain("UsageNotificationDetector");
    expect(main).toContain("usageNotificationDetector.detect(snapshot.usage, snapshot.settings.notifications)");
    expect(main).toContain("Notification.isSupported()");
    expect(main).toContain("usageHistoryStore?.record(fetchedUsage)");
    expect(main).toContain("enrichUsageWithInsights");
    expect(main).not.toContain("UsageResetDetector");
  });

  it("중복 실행을 막고 짧은 화면에 맞춰 팝업 높이를 줄인다", () => {
    const main = readFileSync(resolve(process.cwd(), "src/main/main.ts"), "utf8");

    expect(main).toContain("app.requestSingleInstanceLock()");
    expect(main).toContain('app.on("second-instance"');
    expect(main).toContain("Math.min(640, workArea.height - 16)");
  });

  it("패널에서 다른 곳으로 포커스가 이동하면 모든 플랫폼에서 창을 숨긴다", () => {
    const main = readFileSync(resolve(process.cwd(), "src/main/main.ts"), "utf8");

    expect(main).toContain("function scheduleHideAfterFocusLoss()");
    expect(main).toContain('window.on("blur"');
    expect(main).toContain("scheduleHideAfterFocusLoss()");
    expect(main).toContain("window.isVisible() && !window.isFocused()");
    expect(main).toContain("window.hide()");
  });

  it("새 설정·이력·진단·상태 페이지 IPC를 main과 preload에 동일하게 공개한다", () => {
    const main = readFileSync(resolve(process.cwd(), "src/main/main.ts"), "utf8");
    const preload = readFileSync(resolve(process.cwd(), "src/preload/preload.ts"), "utf8");
    const channels = [
      "settings:refresh-interval",
      "settings:notifications",
      "history:get",
      "app:copy-diagnostics",
      "app:open-status-page"
    ];

    for (const channel of channels) {
      expect(main).toContain(`ipcMain.handle("${channel}"`);
      expect(preload).toContain(`ipcRenderer.invoke("${channel}"`);
    }

    expect(preload).toContain("setRefreshIntervalMs");
    expect(preload).toContain("setNotificationSettings");
    expect(preload).toContain("getHistory");
    expect(preload).toContain("copyDiagnostics");
    expect(preload).toContain("openStatusPage");
  });

  it("이력 범위를 검증하고 공식 서비스 상태와 장애 알림을 갱신한다", () => {
    const main = readFileSync(resolve(process.cwd(), "src/main/main.ts"), "utf8");

    expect(main).toContain('["24h", "7d", "30d"].includes(range)');
    expect(main).toContain("getAllProviderServiceStatuses");
    expect(main).toContain("serviceStatus: sharedServiceStatus(item.provider, settings.language)");
    expect(main).toContain("notifyServiceStatusChanges(settings)");
    expect(main).toContain("https://status.openai.com/");
    expect(main).toContain("https://status.claude.com/");
    expect(main).toContain("clipboard.writeText(serializeDiagnosticsReport");
    expect(main).toContain("shell.openExternal(statusPageUrl)");
  });
});
