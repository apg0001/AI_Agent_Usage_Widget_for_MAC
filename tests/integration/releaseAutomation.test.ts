import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("릴리스 자동화 계약", () => {
  const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
    scripts: Record<string, string>;
    build: { publish: { releaseType: string } };
  };
  const workflowPath = resolve(process.cwd(), ".github/workflows/release.yml");

  it("npm version 생명주기가 검증과 원자적 태그 푸시에 연결된다", () => {
    expect(packageJson.scripts["release:auto"]).toContain("release-harness.js bump");
    expect(packageJson.scripts.preversion).toContain("release:preflight");
    expect(packageJson.scripts.preversion).toContain("npm run verify");
    expect(packageJson.scripts.postversion).toContain("release-harness.js push");
  });

  it("일반 패키징은 암묵적으로 게시하지 않고 저수준 게시도 draft만 만든다", () => {
    for (const platform of ["mac", "win", "linux"]) {
      expect(packageJson.scripts[`package:${platform}`]).toContain("--publish never");
    }
    expect(packageJson.build.publish.releaseType).toBe("draft");
  });

  it("태그 워크플로가 세 OS를 패키징한 뒤 단일 finalizer에서만 공개한다", () => {
    expect(existsSync(workflowPath)).toBe(true);
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("windows-latest");
    expect(workflow).toContain("macos-latest");
    expect(workflow).toContain("ubuntu-latest");
    expect(workflow).toContain("--publish never");
    expect(workflow).toContain("needs: build");
    expect(workflow).toContain("merge-multiple: true");
    expect(workflow).toContain("node scripts/publish-release.js release/assets");
  });
});
