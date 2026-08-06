import { AppSettings, ProviderId, ProviderUsage, PROVIDERS } from "../shared/types.js";

type ProviderAdapter = {
  id: ProviderId;
  label: string;
  fetchUsage: (credential?: string) => Promise<Omit<ProviderUsage, "provider" | "label" | "updatedAt">>;
};

function seededUsage(provider: ProviderId, credential?: string) {
  if (!credential) {
    return {
      used: 0,
      limit: 0,
      unit: "requests" as const,
      percent: 0,
      status: "signed-out" as const,
      message: "로그인이 필요합니다."
    };
  }

  const seed = Array.from(`${provider}:${credential}:${new Date().getMinutes()}`).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0
  );
  const limit = provider === "gemini" ? 1_500 : provider === "claude" ? 1_000 : 500;
  const used = Math.min(limit, Math.round(limit * (0.25 + (seed % 70) / 100)));
  const percent = Math.round((used / limit) * 100);

  return {
    used,
    limit,
    unit: "requests" as const,
    percent,
    status: percent >= 90 ? ("critical" as const) : percent >= 75 ? ("warning" as const) : ("ok" as const),
    message: "데모 사용량입니다. 실제 API 어댑터 연결이 필요합니다."
  };
}

const adapters: ProviderAdapter[] = PROVIDERS.map((provider) => ({
  ...provider,
  fetchUsage: async (credential?: string) => seededUsage(provider.id, credential)
}));

export async function fetchUsageSnapshot(settings: AppSettings): Promise<ProviderUsage[]> {
  const visibleAdapters = adapters.filter((adapter) => settings.providers[adapter.id].visible);

  return Promise.all(
    visibleAdapters.map(async (adapter) => {
      try {
        const providerSettings = settings.providers[adapter.id];
        const credential = providerSettings.auth?.accessToken;
        const result = await adapter.fetchUsage(credential);
        return {
          provider: adapter.id,
          label: adapter.label,
          updatedAt: new Date().toISOString(),
          ...result
        };
      } catch (error) {
        return {
          provider: adapter.id,
          label: adapter.label,
          used: 0,
          limit: 0,
          unit: "requests",
          percent: 0,
          status: "error",
          updatedAt: new Date().toISOString(),
          message: error instanceof Error ? error.message : "사용량을 불러오지 못했습니다."
        };
      }
    })
  );
}
