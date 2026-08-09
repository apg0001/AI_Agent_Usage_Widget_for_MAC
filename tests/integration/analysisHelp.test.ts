import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "src/renderer/src/App.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/renderer/src/styles.css"), "utf8");
const readme = readFileSync(resolve(process.cwd(), "README.md"), "utf8");
const i18n = readFileSync(resolve(process.cwd(), "src/shared/i18n.ts"), "utf8");

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

describe("사용량 분석 설명", () => {
  it("README에 실제 계산 조건과 한계를 설명한다", () => {
    expect(readme).toContain("## 사용량 분석 방식");
    expect(readme).toContain("최소제곱 선형 회귀");
    expect(readme).toContain("최소 2개 기록이 5분 이상");
    expect(readme).toContain("현재 값과 이력이 모두 정확하고 기록이 4개 이상");
    expect(readme).toContain("현재 사용률 + 시간당 소진율 × 초기화까지 남은 시간");
    expect(readme).toContain("실제 소진 시각을 보장하지 않습니다");
  });

  it("소진 예상 카드에서 접근 가능한 도움말 dialog를 연다", () => {
    expect(appSource).toMatch(/aria-labelledby="pace-heading"[\s\S]*?<UsageAnalysisHelp \/>[\s\S]*?<PaceSummary/);
    expect(appSource).toContain("aria-label={t.analysisHelp.triggerAria}");
    expect(appSource).toContain('aria-haspopup="dialog"');
    expect(appSource).toContain('id="usage-analysis-help"');
    expect(appSource).toContain('aria-labelledby="analysis-help-title"');
    expect(appSource).toContain("dialog.showModal()");
    expect(appSource).toContain('window.addEventListener("blur", closeOnWindowBlur)');
    expect(appSource).toContain('document.querySelector("dialog:modal")');
    expect(appSource).toContain("onClose={() => triggerRef.current?.focus()}");
    expect(appSource).toContain("aria-label={t.analysisHelp.bodyAria}");
    expect(appSource).toContain("tabIndex={0}");
    expect(i18n).toContain('triggerAria: "사용량 분석 방식 보기"');
    expect(i18n).toContain('bodyAria: "사용량 분석 설명"');
  });

  it("작은 트레이 창에서는 dialog 본문만 스크롤한다", () => {
    const dialog = declarationsFor(".analysis-dialog");
    const panel = declarationsFor(".analysis-dialog-panel");
    const body = declarationsFor(".analysis-dialog-body");

    expect(dialog.get("width")).toBe("min(360px, calc(100vw - 32px))");
    expect(dialog.get("max-height")).toBe("calc(100vh - 32px)");
    expect(dialog.get("overflow")).toBe("hidden");
    expect(panel.get("max-height")).toBe("calc(100vh - 34px)");
    expect(panel.get("display")).toBe("flex");
    expect(panel.get("flex-direction")).toBe("column");
    expect(body.get("min-height")).toBe("0");
    expect(body.get("overflow-y")).toBe("auto");
  });
});
