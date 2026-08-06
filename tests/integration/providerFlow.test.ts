import { describe, expect, it } from "vitest";
import { fetchUsageSnapshot } from "../../src/main/usageProviders";
import { AppSettings } from "../../src/shared/types";

function login(settings: AppSettings, provider: keyof AppSettings["providers"], token: string): AppSettings {
  return {
    ...settings,
    providers: {
      ...settings.providers,
      [provider]: {
        ...settings.providers[provider],
        token,
        auth: {
          type: "api-key",
          accessToken: token,
          accountLabel: "API 키"
        }
      }
    }
  };
}

function logout(settings: AppSettings, provider: keyof AppSettings["providers"]): AppSettings {
  const nextProvider = { ...settings.providers[provider] };
  delete nextProvider.token;
  delete nextProvider.auth;

  return {
    ...settings,
    providers: {
      ...settings.providers,
      [provider]: nextProvider
    }
  };
}

function setVisible(settings: AppSettings, provider: keyof AppSettings["providers"], visible: boolean): AppSettings {
  return {
    ...settings,
    providers: {
      ...settings.providers,
      [provider]: {
        ...settings.providers[provider],
        visible
      }
    }
  };
}

describe("제공자 설정 흐름", () => {
  it("로그인, 표시 모델 선택, 로그아웃 흐름을 검증한다", async () => {
    let settings: AppSettings = {
      refreshIntervalMs: 10_000,
      providers: {
        codex: { visible: true },
        claude: { visible: true },
        gemini: { visible: true }
      }
    };

    settings = login(settings, "codex", "codex-token");
    settings = login(settings, "gemini", "gemini-token");
    settings = setVisible(settings, "claude", false);

    let usage = await fetchUsageSnapshot(settings);
    expect(usage.map((item) => item.provider)).toEqual(["codex", "gemini"]);
    expect(usage.every((item) => item.status !== "signed-out")).toBe(true);

    settings = logout(settings, "codex");
    usage = await fetchUsageSnapshot(settings);

    expect(usage.find((item) => item.provider === "codex")?.status).toBe("signed-out");
    expect(usage.find((item) => item.provider === "gemini")?.status).not.toBe("signed-out");
  });

  it("레거시 token 값만으로는 로그인 상태로 보지 않는다", async () => {
    const settings: AppSettings = {
      refreshIntervalMs: 10_000,
      providers: {
        codex: { visible: true, token: "old-token" },
        claude: { visible: true },
        gemini: { visible: true }
      }
    };

    const usage = await fetchUsageSnapshot({
      ...settings,
      providers: {
        ...settings.providers,
        codex: {
          visible: true
        }
      }
    });

    expect(usage.find((item) => item.provider === "codex")?.status).toBe("signed-out");
  });
});
