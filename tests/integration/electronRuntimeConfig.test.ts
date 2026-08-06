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
    expect(packageJson.scripts.dev).toContain("env -u ELECTRON_RUN_AS_NODE electron .");
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
});
