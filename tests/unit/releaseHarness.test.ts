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
});
