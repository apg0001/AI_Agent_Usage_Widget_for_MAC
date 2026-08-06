import { describe, expect, it } from "vitest";
import { getTrayTitle } from "../../src/main/trayTitle";
import { UsageSnapshot } from "../../src/shared/types";

const snapshot: UsageSnapshot = {
  settings: {
    refreshIntervalMs: 10_000,
    menuBarDisplayMode: "iconsWithPercent",
    providers: {
      codex: { visible: true },
      claude: { visible: true },
      gemini: { visible: true }
    }
  },
  usage: [
    {
      provider: "codex",
      label: "Codex",
      used: 30,
      limit: 100,
      unit: "requests",
      percent: 30,
      status: "ok",
      updatedAt: new Date().toISOString()
    },
    {
      provider: "claude",
      label: "Claude",
      used: 80,
      limit: 100,
      unit: "requests",
      percent: 80,
      status: "warning",
      updatedAt: new Date().toISOString()
    },
    {
      provider: "gemini",
      label: "Gemini",
      used: 0,
      limit: 0,
      unit: "requests",
      percent: 0,
      status: "signed-out",
      updatedAt: new Date().toISOString()
    }
  ]
};

describe("getTrayTitle", () => {
  it("아이콘+퍼센트 모드에서 각 모델별 퍼센트를 표시한다", () => {
    expect(getTrayTitle(snapshot)).toBe("Co 30% Cl 80% G 0%");
  });

  it("아이콘 모드에서는 선택된 모델 약칭만 표시한다", () => {
    expect(
      getTrayTitle({
        ...snapshot,
        settings: {
          ...snapshot.settings,
          menuBarDisplayMode: "icons"
        }
      })
    ).toBe("Co Cl G");
  });
});
