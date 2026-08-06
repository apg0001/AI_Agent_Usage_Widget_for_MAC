import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("하네스 문서", () => {
  it("플랫폼별 검증과 패키징 절차를 별도 문서로 제공한다", () => {
    const harnessPath = resolve(process.cwd(), "HARNESS.md");
    const readme = readFileSync(resolve(process.cwd(), "README.md"), "utf8");
    const harness = readFileSync(harnessPath, "utf8");

    expect(existsSync(harnessPath)).toBe(true);
    expect(readme).toContain("HARNESS.md");
    expect(harness).toContain("npm run verify");
    expect(harness).toContain("npm run package:mac");
    expect(harness).toContain("npm run package:win");
    expect(harness).toContain("npm run package:linux");
    expect(harness).toContain("tests/integration/crossPlatformBuild.test.ts");
    expect(harness).toContain("dist 정리 기준");
  });
});
