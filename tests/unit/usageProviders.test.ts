import { describe, expect, it } from "vitest";
import { fetchUsageSnapshot, formatRemaining, windowLabel } from "../../src/main/usageProviders";
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
  it("초기화까지 24시간보다 크면 일/시간/분으로 표시한다", () => {
    const resetsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000 + 4 * 60 * 1000).toISOString();

    expect(formatRemaining(resetsAt)).toMatch(/^2일 3시간 [45]분$/);
  });

  it("Codex가 7일 사용량 창을 주간 한도로 표시한다", () => {
    expect(windowLabel(604_800, "한도")).toBe("주간 한도");
  });

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
            type: "token",
            accessToken: "codex-token"
          }
        }
      }
    });

    const codex = usage.find((item) => item.provider === "codex");
    expect(codex?.status).not.toBe("signed-out");
    expect(codex?.limit).toBe(500);
    expect(codex?.percent).toBeGreaterThan(0);
  });

  it("Gemini는 OAuth 인증 상태를 로그인으로 표시한다", async () => {
    const usage = await fetchUsageSnapshot({
      ...baseSettings,
      providers: {
        ...baseSettings.providers,
        gemini: {
          visible: true,
          auth: {
            type: "oauth",
            accessToken: "gemini-oauth-token",
            accountLabel: "Google OAuth"
          }
        }
      }
    });

    const gemini = usage.find((item) => item.provider === "gemini");
    expect(gemini?.status).toBe("ok");
    expect(gemini?.source).toBe("api");
    expect(gemini?.windows?.some((window) => window.id === "daily")).toBe(true);
  });

  it("Claude는 앱 토큰 인증을 로그인 상태로 보지 않는다", async () => {
    const usage = await fetchUsageSnapshot({
      ...baseSettings,
      providers: {
        ...baseSettings.providers,
        claude: {
          visible: true,
          auth: {
            type: "token",
            accessToken: "claude-token"
          }
        }
      }
    });

    const claude = usage.find((item) => item.provider === "claude");
    expect(claude?.status).toBe("signed-out");
    expect(claude?.message).toContain("claude /login");
  });
});
