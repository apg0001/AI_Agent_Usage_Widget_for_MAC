import { describe, expect, it } from "vitest";
import releaseHarness from "../../scripts/release-harness.js";
import releaseAssets from "../../scripts/stage-release-assets.js";
import releasePublisher from "../../scripts/publish-release.js";

describe("자동 릴리스 하네스", () => {
  it.each([
    ["win32", "win"],
    ["darwin", "mac"],
    ["linux", "linux"]
  ] as const)("%s 호스트를 %s 패키징으로 연결한다", (platform, expected) => {
    expect(releaseHarness.platformKey(platform)).toBe(expected);
  });

  it("Windows에서도 npm.cmd를 직접 spawn하지 않고 현재 npm CLI를 Node로 실행한다", () => {
    expect(releaseHarness.npmInvocation({ npm_execpath: "C:/npm/npm-cli.js" }, "win32")).toEqual({
      command: process.execPath,
      argsPrefix: ["C:/npm/npm-cli.js"]
    });
    expect(releaseHarness.npmInvocation({ ComSpec: "C:/Windows/System32/cmd.exe" }, "win32")).toEqual({
      command: "C:/Windows/System32/cmd.exe",
      argsPrefix: ["/d", "/s", "/c", "npm.cmd"]
    });
  });

  it("지원하지 않는 플랫폼과 잘못된 버전 입력을 거부한다", () => {
    expect(() => releaseHarness.platformKey("freebsd")).toThrow("Unsupported release platform");
    expect(releaseHarness.isVersion("0.4.3")).toBe(true);
    expect(releaseHarness.isVersion("v0.4.3")).toBe(false);
  });

  it("GitHub publish 설정에서 저장소를 읽는다", () => {
    expect(releaseHarness.repositoryInfo({
      build: {
        publish: {
          provider: "github",
          owner: "apg0001",
          repo: "AI_Agent_Usage_Widget_for_MAC"
        }
      }
    })).toEqual({ owner: "apg0001", repo: "AI_Agent_Usage_Widget_for_MAC" });
  });

  it("updater feed를 파싱하고 원격용 안전한 파일명으로 바꾼다", () => {
    const feed = releaseAssets.parseUpdateFeed([
      "version: 0.4.3",
      "files:",
      "  - url: GigaCharge-Setup-0.4.3.exe",
      "    sha512: abc123",
      "    size: 42"
    ].join("\n"));

    expect(feed).toEqual({
      version: "0.4.3",
      files: [{ url: "GigaCharge-Setup-0.4.3.exe", sha512: "abc123", size: 42 }]
    });
    expect(releaseAssets.safeAssetName("GigaCharge Setup 0.4.3.exe")).toBe("GigaCharge-Setup-0.4.3.exe");
  });

  it("세 운영체제 feed와 패키지가 모두 있어야 공개를 허용한다", () => {
    const complete = [
      "GigaCharge-Setup-0.4.3.exe",
      "GigaCharge-Setup-0.4.3.exe.blockmap",
      "GigaCharge-0.4.3.exe",
      "latest.yml",
      "GigaCharge-0.4.3-arm64.dmg",
      "GigaCharge-0.4.3-arm64-mac.zip",
      "latest-mac.yml",
      "GigaCharge-0.4.3.AppImage",
      "quota-bar_0.4.3_amd64.deb",
      "latest-linux.yml"
    ];

    expect(() => releasePublisher.assertCompleteAssetSet(complete, "0.4.3")).not.toThrow();
    expect(() => releasePublisher.assertCompleteAssetSet(
      complete.filter((name) => name !== "latest.yml"),
      "0.4.3"
    )).toThrow("release is missing latest.yml");
  });

  it("blocks a new bump while the current tagged release needs recovery", () => {
    expect(releaseHarness.classifyCurrentRelease({
      localTagExists: true,
      localTagAtHead: true,
      remoteTagExists: false,
      release: null
    })).toBe("resume-push");
    expect(() => releaseHarness.assertReleaseCanAdvance("v0.4.3", "resume-push")).toThrow(
      "npm run release:resume"
    );

    expect(releaseHarness.classifyCurrentRelease({
      localTagExists: true,
      localTagAtHead: true,
      remoteTagExists: true,
      release: { draft: true, prerelease: false }
    })).toBe("rerun-actions");
    expect(() => releaseHarness.assertReleaseCanAdvance("v0.4.3", "rerun-actions")).toThrow(
      "rerun its failed GitHub Actions workflow"
    );
  });

  it("allows the next bump only after the current remote release is stable", () => {
    expect(releaseHarness.classifyCurrentRelease({
      localTagExists: true,
      localTagAtHead: true,
      remoteTagExists: true,
      release: { draft: false, prerelease: false }
    })).toBe("published");
    expect(() => releaseHarness.assertReleaseCanAdvance("v0.4.3", "published")).not.toThrow();

    expect(releaseHarness.classifyCurrentRelease({
      localTagExists: true,
      localTagAtHead: false,
      remoteTagExists: true,
      release: { draft: false, prerelease: false }
    })).toBe("published");

    expect(releaseHarness.classifyCurrentRelease({
      localTagExists: true,
      localTagAtHead: false,
      remoteTagExists: true,
      release: null
    })).toBe("rerun-actions");
  });

  it("requires package and lockfile versions to stay aligned", () => {
    const packageJson = { version: "0.4.3" };
    const alignedLock = { version: "0.4.3", packages: { "": { version: "0.4.3" } } };
    expect(releaseHarness.assertVersionAlignment(packageJson, alignedLock)).toBe("0.4.3");
    expect(() => releaseHarness.assertVersionAlignment(packageJson, {
      version: "0.4.2",
      packages: { "": { version: "0.4.3" } }
    })).toThrow("must all describe version 0.4.3");
  });

  it("does not treat the Windows installer as the portable executable", () => {
    const withoutPortable = [
      "GigaCharge-Setup-0.4.3.exe",
      "GigaCharge-Setup-0.4.3.exe.blockmap",
      "latest.yml",
      "GigaCharge-0.4.3-arm64.dmg",
      "GigaCharge-0.4.3-arm64-mac.zip",
      "latest-mac.yml",
      "GigaCharge-0.4.3.AppImage",
      "quota-bar_0.4.3_amd64.deb",
      "latest-linux.yml"
    ];

    expect(() => releasePublisher.assertCompleteAssetSet(withoutPortable, "0.4.3")).toThrow(
      "Windows installer or portable executable"
    );
    expect(() => releaseAssets.assertPlatformAssets("win", withoutPortable)).toThrow("portable executable");
  });

  it("refuses destructive staging paths outside the release workspace", () => {
    const releaseRoot = `${process.cwd()}/release`;
    const output = `${releaseRoot}/build-win`;
    expect(releaseAssets.assertSafeStagingPath(output, `${releaseRoot}/staged-win`, releaseRoot)).toContain(
      "staged-win"
    );
    expect(() => releaseAssets.assertSafeStagingPath(output, releaseRoot, releaseRoot)).toThrow(
      "must be a child"
    );
    expect(() => releaseAssets.assertSafeStagingPath(output, output, releaseRoot)).toThrow(
      "must not equal"
    );
    expect(() => releaseAssets.assertSafeStagingPath(output, `${process.cwd()}/outside`, releaseRoot)).toThrow(
      "must be a child"
    );
  });

  it("rejects an existing prerelease before published-release reuse", () => {
    expect(() => releasePublisher.releaseDisposition({ draft: false, prerelease: true }, "v0.4.3")).toThrow(
      "exists as a prerelease"
    );
    expect(releasePublisher.releaseDisposition({ draft: false, prerelease: false }, "v0.4.3")).toBe("published");
  });
});
