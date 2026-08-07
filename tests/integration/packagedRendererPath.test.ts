import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getRendererIndexPath } from "../../src/main/rendererPath";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("패키징 renderer 경로", () => {
  it("빌드된 main 디렉터리에서 renderer index.html을 찾을 수 있는 경로를 계산한다", () => {
    const builtMainDir = resolve(__dirname, "../../dist/main/main");
    const rendererIndexPath = getRendererIndexPath(builtMainDir);

    expect(rendererIndexPath.endsWith(join("dist", "renderer", "index.html"))).toBe(true);
  });

  it("소스 renderer index.html이 존재한다", () => {
    const sourceIndexPath = resolve(process.cwd(), "src/renderer/index.html");

    expect(existsSync(sourceIndexPath)).toBe(true);
  });
});
