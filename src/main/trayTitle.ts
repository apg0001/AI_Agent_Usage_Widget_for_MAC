import { PROVIDERS, UsageSnapshot } from "../shared/types.js";

const providerInitials = {
  codex: "C",
  claude: "Cl",
  gemini: "G"
} as const;

export function getTrayTitle(snapshot: UsageSnapshot) {
  const visibleProviders = PROVIDERS.filter((provider) => snapshot.settings.providers[provider.id].visible);

  if (!visibleProviders.length) {
    return "AI";
  }

  if (snapshot.settings.menuBarDisplayMode === "icons") {
    return visibleProviders.map((provider) => providerInitials[provider.id]).join(" ");
  }

  return visibleProviders
    .map((provider) => {
      const usage = snapshot.usage.find((item) => item.provider === provider.id);
      return `${providerInitials[provider.id]} ${usage?.percent ?? 0}%`;
    })
    .join(" ");
}
