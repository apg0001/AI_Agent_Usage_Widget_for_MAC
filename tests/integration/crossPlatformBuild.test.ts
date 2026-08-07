import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("플랫폼별 빌드 설정", () => {
  it("macOS, Windows, Linux 패키징 스크립트와 타깃을 분리한다", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
      build: {
        files: string[];
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
    expect(packageJson.build.files).toEqual(["dist/main/**/*", "dist/renderer/**/*", "package.json"]);
    expect(packageJson.build.files).not.toContain("dist/**/*");
  });

  it("플랫폼별 앱 아이콘이 설정되어 있고 실제 파일이 존재한다", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      build: {
        mac: { icon: string };
        win: { icon: string };
        linux: { icon: string };
      };
    };

    expect(packageJson.build.mac.icon).toBe("build/icon.png");
    expect(packageJson.build.win.icon).toBe("build/icon.png");
    expect(packageJson.build.linux.icon).toBe("build/icon.png");
    expect(existsSync(resolve(process.cwd(), "build/icon.png"))).toBe(true);
  });
});
