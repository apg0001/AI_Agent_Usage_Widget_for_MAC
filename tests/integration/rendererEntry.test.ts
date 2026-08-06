import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("렌더러 진입점", () => {
  it("index.html이 React 앱을 마운트하는 main.tsx를 불러온다", () => {
    const html = readFileSync(resolve(process.cwd(), "src/renderer/index.html"), "utf8");

    expect(html).toContain('src="/src/main.tsx"');
    expect(html).not.toContain('src="/src/App.tsx"');
  });
});
