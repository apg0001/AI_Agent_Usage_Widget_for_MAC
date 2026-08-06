import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vite 패키징 설정", () => {
  it("Electron loadFile 환경에서 assets를 상대경로로 로드하도록 base를 설정한다", () => {
    const config = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");

    expect(config).toContain('base: "./"');
  });
});
