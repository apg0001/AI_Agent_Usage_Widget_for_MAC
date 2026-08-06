import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("플랫폼별 빌드 설정", () => {
  it("macOS, Windows, Linux 패키징 스크립트와 타깃을 분리한다", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
      build: {
        mac: { target: string[] };
        win: { target: string[] };
        linux: { target: string[] };
      };
    };

    expect(packageJson.scripts["package:mac"]).toContain("electron-builder --mac");
    expect(packageJson.scripts["package:win"]).toContain("electron-builder --win");
    expect(packageJson.scripts["package:linux"]).toContain("electron-builder --linux");
    expect(packageJson.build.mac.target).toEqual(["dmg", "zip"]);
    expect(packageJson.build.win.target).toEqual(["nsis", "portable"]);
    expect(packageJson.build.linux.target).toEqual(["AppImage", "deb"]);
  });
});
