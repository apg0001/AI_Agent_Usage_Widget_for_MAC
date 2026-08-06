import { describe, expect, it } from "vitest";
import { fetchUsageSnapshot } from "../../src/main/usageProviders";
import { AppSettings } from "../../src/shared/types";

const baseSettings: AppSettings = {
  refreshIntervalMs: 10_000,
  menuBarDisplayMode: "icons",
  providers: {
    codex: { visible: true },
    claude: { visible: true },
    gemini: { visible: true }
  }
};

describe("fetchUsageSnapshot", () => {
  it("표시 설정이 켜진 제공자만 반환한다", async () => {
    const usage = await fetchUsageSnapshot({
      ...baseSettings,
      providers: {
        ...baseSettings.providers,
        claude: { visible: false }
      }
    });

    expect(usage.map((item) => item.provider)).toEqual(["codex", "gemini"]);
  });

  it("토큰이 없는 제공자는 로그아웃 상태로 표시한다", async () => {
    const usage = await fetchUsageSnapshot(baseSettings);

    expect(usage).toHaveLength(3);
    expect(usage.every((item) => item.status === "signed-out")).toBe(true);
  });

  it("토큰이 있으면 사용량과 비율을 계산한다", async () => {
    const usage = await fetchUsageSnapshot({
      ...baseSettings,
      providers: {
        ...baseSettings.providers,
        codex: {
          visible: true,
          auth: {
            type: "oauth",
            accessToken: "codex-oauth-token"
          }
        }
      }
    });

    const codex = usage.find((item) => item.provider === "codex");
    expect(codex?.status).not.toBe("signed-out");
    expect(codex?.limit).toBe(500);
    expect(codex?.percent).toBeGreaterThan(0);
  });
});
