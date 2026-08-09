import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "src/renderer/src/App.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/renderer/src/styles.css"), "utf8");

function declarationsFor(selector: string) {
  const declarations = new Map<string, string>();

  for (const match of styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!selectors.includes(selector)) {
      continue;
    }

    for (const declaration of match[2].split(";").map((item) => item.trim()).filter(Boolean)) {
      const separator = declaration.indexOf(":");
      declarations.set(
        declaration.slice(0, separator).trim(),
        declaration.slice(separator + 1).trim().replace(/\s+/g, " ")
      );
    }
  }

  return declarations;
}

describe("히스토리 시간 축 UI", () => {
  it("그래프와 같은 정제 데이터를 사용해 SVG 아래에 time 라벨을 표시한다", () => {
    expect(appSource).toContain("normalizeHistoryPoints");
    expect(appSource).toContain("buildHistoryAxisTicks(points, range)");
    expect(appSource).toMatch(/<\/svg>[\s\S]*?className="history-time-axis"[\s\S]*?<time/);
    expect(appSource).toContain("dateTime={tick.timestamp}");
    expect(appSource).toContain("data-position={tick.position}");
    expect(appSource).toContain("firstTick.fullLabel");
    expect(appSource).toContain("lastTick.fullLabel");
  });

  it("좁은 트레이에서도 세 라벨을 같은 폭에 배치하고 넘치는 글자를 줄인다", () => {
    const axis = declarationsFor(".history-time-axis");
    const time = declarationsFor(".history-time-axis time");

    expect(axis.get("display")).toBe("grid");
    expect(axis.get("grid-template-columns")).toBe("repeat(3, minmax(0, 1fr))");
    expect(axis.get("color")).toBe("#64748b");
    expect(axis.get("font-size")).toBe("10px");
    expect(axis.get("font-variant-numeric")).toBe("tabular-nums");
    expect(time.get("min-width")).toBe("0");
    expect(time.get("overflow")).toBe("hidden");
    expect(time.get("text-overflow")).toBe("ellipsis");
    expect(time.get("white-space")).toBe("nowrap");
  });
});
