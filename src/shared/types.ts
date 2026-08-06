export type ProviderId = "codex" | "claude" | "gemini";

export type ProviderUsage = {
  provider: ProviderId;
  label: string;
  used: number;
  limit: number;
  unit: "requests" | "tokens" | "credits";
  percent: number;
  status: "ok" | "warning" | "critical" | "signed-out" | "error";
  updatedAt: string;
  message?: string;
};

export type ProviderSettings = {
  visible: boolean;
  auth?: ProviderAuth;
  token?: string;
};

export type ProviderAuth = {
  type: "api-key" | "oauth";
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  accountLabel?: string;
};

export type AppSettings = {
  refreshIntervalMs: number;
  providers: Record<ProviderId, ProviderSettings>;
};

export type UsageSnapshot = {
  settings: AppSettings;
  usage: ProviderUsage[];
};

export type LoginPayload = {
  provider: ProviderId;
  token: string;
};

export type OAuthLoginResult = {
  provider: ProviderId;
  status: "success" | "unsupported" | "missing-config" | "error";
  message: string;
};

export const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: "codex", label: "Codex" },
  { id: "claude", label: "Claude" },
  { id: "gemini", label: "Gemini" }
];
