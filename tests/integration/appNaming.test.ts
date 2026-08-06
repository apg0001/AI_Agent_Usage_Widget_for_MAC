import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("앱 이름", () => {
  it("주요 표시 표면에서 Quota Bar를 사용한다", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      name: string;
      build: { productName: string };
    };
    const renderer = readFileSync(resolve(process.cwd(), "src/renderer/src/App.tsx"), "utf8");
    const html = readFileSync(resolve(process.cwd(), "src/renderer/index.html"), "utf8");
    const main = readFileSync(resolve(process.cwd(), "src/main/main.ts"), "utf8");

    expect(packageJson.name).toBe("quota-bar");
    expect(packageJson.build.productName).toBe("Quota Bar");
    expect(renderer).toContain("<h1>Quota Bar</h1>");
    expect(html).toContain("<title>Quota Bar</title>");
    expect(main).toContain("Quota Bar 열기");
  });
});
