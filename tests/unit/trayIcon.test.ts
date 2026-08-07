import { describe, expect, it } from "vitest";
import { buildStaticTrayIconSvg, buildUsageTrayIconSvg } from "../../src/main/trayIcon";
import { UsageSnapshot } from "../../src/shared/types";

const snapshot: UsageSnapshot = {
  settings: {
    refreshIntervalMs: 10_000,
    menuBarDisplayMode: "iconsWithPercent",
    providers: {
      codex: { visible: true },
      claude: { visible: true },
      gemini: { visible: false }
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
    }
  ]
};

describe("buildUsageTrayIconSvg", () => {
  it("Windows/Linux 트레이 아이콘에 제공자별 퍼센트 숫자를 색상 구획으로 그려 넣는다", () => {
    const svg = buildUsageTrayIconSvg(snapshot);

    expect(svg).toContain("<svg");
    expect(svg).toContain(">30<");
    expect(svg).toContain(">80<");
  });

  it("표시 순서는 Codex, Claude 순으로 위에서부터 세로로 배치한다", () => {
    const svg = buildUsageTrayIconSvg(snapshot);

    expect(svg.indexOf(">30<")).toBeLessThan(svg.indexOf(">80<"));
  });

  it("아이콘 모드에서는 퍼센트 없이 약칭만 그려 넣는다", () => {
    const svg = buildUsageTrayIconSvg({
      ...snapshot,
      settings: { ...snapshot.settings, menuBarDisplayMode: "icons" }
    });

    expect(svg).toContain(">Co<");
    expect(svg).toContain(">Cl<");
    expect(svg).not.toContain("%");
  });

  it("표시할 제공자가 없으면 AI 텍스트로 대체한다", () => {
    const svg = buildUsageTrayIconSvg({
      ...snapshot,
      settings: {
        ...snapshot.settings,
        providers: {
          codex: { visible: false },
          claude: { visible: false },
          gemini: { visible: false }
        }
      }
    });

    expect(svg).toContain(">AI<");
  });

  it("경고 상태 구획은 정상 상태 구획과 다른 배경색을 사용한다", () => {
    const svg = buildUsageTrayIconSvg(snapshot);

    expect(svg).toContain('fill="#2563eb"');
    expect(svg).toContain('fill="#f59e0b"');
  });
});

describe("buildStaticTrayIconSvg", () => {
  it("기본 정적 아이콘 SVG를 반환한다", () => {
    const svg = buildStaticTrayIconSvg();

    expect(svg).toContain("<svg");
    expect(svg).toContain("fill=\"#111827\"");
  });
});
