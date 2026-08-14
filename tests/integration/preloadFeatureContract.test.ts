import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationSettings, ProviderId, UsageHistoryRange } from "../../src/shared/types";

const electronMocks = vi.hoisted(() => ({
  exposedName: "",
  exposedApi: undefined as unknown,
  invoke: vi.fn(async () => undefined),
  on: vi.fn(),
  removeListener: vi.fn()
}));

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: unknown) => {
      electronMocks.exposedName = name;
      electronMocks.exposedApi = api;
    }
  },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener
  }
}));

type FeatureApi = {
  setRefreshIntervalMs: (intervalMs: number) => Promise<unknown>;
  setNotificationSettings: (settings: NotificationSettings) => Promise<unknown>;
  getHistory: (provider: ProviderId, range?: UsageHistoryRange) => Promise<unknown>;
  copyDiagnostics: () => Promise<unknown>;
  copyText: (text: string) => Promise<unknown>;
  openStatusPage: (provider: ProviderId) => Promise<unknown>;
  restartApp: () => Promise<unknown>;
};

let api: FeatureApi;

const notifications: NotificationSettings = {
  enabled: true,
  cooldownMinutes: 20,
  quietHours: { enabled: true, start: "23:00", end: "07:00" },
  providers: {
    codex: { enabled: true, thresholds: [80, 95], resetEnabled: true, projectedExhaustionEnabled: true },
    claude: { enabled: true, thresholds: [75, 90], resetEnabled: true, projectedExhaustionEnabled: false },
    gemini: { enabled: false, thresholds: [90], resetEnabled: false, projectedExhaustionEnabled: false }
  }
};

beforeAll(async () => {
  await import("../../src/preload/preload");
  api = electronMocks.exposedApi as FeatureApi;
});

beforeEach(() => {
  electronMocks.invoke.mockClear();
});

describe("preload 신규 기능 계약", () => {
  it("aiUsage 브릿지를 노출한다", () => {
    expect(electronMocks.exposedName).toBe("aiUsage");
    expect(api).toBeDefined();
  });

  it("갱신 주기와 알림 설정을 그대로 main에 전달한다", async () => {
    await api.setRefreshIntervalMs(60_000);
    await api.setNotificationSettings(notifications);

    expect(electronMocks.invoke.mock.calls).toEqual([
      ["settings:refresh-interval", 60_000],
      ["settings:notifications", notifications]
    ]);
  });

  it("이력의 기본 범위는 24시간이고 선택 범위도 전달한다", async () => {
    await api.getHistory("codex");
    await api.getHistory("claude", "30d");

    expect(electronMocks.invoke.mock.calls).toEqual([
      ["history:get", "codex", "24h"],
      ["history:get", "claude", "30d"]
    ]);
  });

  it("진단 복사와 공식 상태 페이지 열기를 구분한다", async () => {
    await api.copyDiagnostics();
    await api.copyText("sudo apt install -y '/tmp/GigaCharge.deb'");
    await api.openStatusPage("claude");

    expect(electronMocks.invoke.mock.calls).toEqual([
      ["app:copy-diagnostics"],
      ["app:copy-text", "sudo apt install -y '/tmp/GigaCharge.deb'"],
      ["app:open-status-page", "claude"]
    ]);
  });

  it("수동 설치 후 재시작은 자동 설치와 다른 채널을 쓴다", async () => {
    await api.restartApp();

    expect(electronMocks.invoke.mock.calls).toEqual([["app:restart"]]);
  });
});
