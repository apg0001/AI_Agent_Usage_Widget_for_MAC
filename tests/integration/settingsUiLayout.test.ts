import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "src/renderer/src/App.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/renderer/src/styles.css"), "utf8");

function declarationsFor(selector: string) {
  const declarations = new Map<string, string>();
  let found = false;

  for (const match of styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!selectors.includes(selector)) {
      continue;
    }

    found = true;
    for (const declaration of match[2].split(";").map((item) => item.trim()).filter(Boolean)) {
      const separator = declaration.indexOf(":");
      declarations.set(
        declaration.slice(0, separator).trim(),
        declaration.slice(separator + 1).trim().replace(/\s+/g, " ")
      );
    }
  }

  if (!found) {
    throw new Error(`CSS selector not found: ${selector}`);
  }
  return declarations;
}

describe("설정 UI 레이아웃 계약", () => {
  it("각 설정 카드는 내용 높이를 유지하고 설정 본문이 남은 영역을 스크롤한다", () => {
    const shell = declarationsFor(".shell");
    const screenContent = declarationsFor(".screen-content");
    const settingsContent = declarationsFor(".settings-content");

    expect(appSource).toContain('className="screen-content settings-content"');
    expect(shell.get("height")).toBe("100vh");
    expect(shell.get("display")).toBe("flex");
    expect(shell.get("flex-direction")).toBe("column");
    expect(screenContent.get("min-height")).toBe("0");
    expect(screenContent.get("flex")).toBe("1");
    expect(screenContent.get("overflow-y")).toBe("auto");
    expect(screenContent.get("overflow-x")).toBe("hidden");
    expect(settingsContent.get("grid-auto-rows")).toBe("max-content");
  });

  it("좁은 설정 행과 시간 입력은 부모 폭 안에서 줄어들 수 있다", () => {
    const settingText = declarationsFor(".setting-row > div");
    const refreshOptions = declarationsFor(".segmented.four");
    const timeRange = declarationsFor(".time-range");
    const timeLabel = declarationsFor(".time-range label");
    const timeInput = declarationsFor(".time-range input");

    expect(settingText.get("min-width")).toBe("0");
    expect(refreshOptions.get("grid-template-columns")).toBe("repeat(4, minmax(0, 1fr))");
    expect(timeRange.get("grid-template-columns")).toBe("minmax(0, 1fr) auto minmax(0, 1fr)");
    expect(timeLabel.get("min-width")).toBe("0");
    expect(timeInput.get("width")).toBe("100%");
  });

  it("설정 헤더에 특정 운영체제만 지칭하는 부제목을 표시하지 않는다", () => {
    expect(appSource).not.toContain("macOS · Windows 공통");
  });
});
