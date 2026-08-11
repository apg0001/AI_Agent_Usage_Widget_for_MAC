export type ProviderId = "codex" | "claude" | "gemini";

export type ThemeSetting = "light" | "dark" | "system";

export type LanguageSetting = "ko" | "en";

export type UsageDataQuality = "exact" | "estimated" | "unavailable";

export type UsagePace = {
  confidence: "insufficient" | "low" | "good";
  burnRatePercentPerHour?: number;
  projectedPercentAtReset?: number;
  estimatedExhaustedAt?: string;
  sampleCount: number;
  sampleSpanMinutes: number;
};

export type UsageFreshness = {
  observedAt?: string;
  receivedAt: string;
  retryAt?: string;
  staleReason?: string;
};

export type UsageSourceInfo = {
  label: string;
  mode: "local" | "poll" | "cache" | "estimate";
};

export type ProviderServiceStatus = {
  state: "operational" | "degraded" | "outage" | "unknown";
  label: string;
  message?: string;
  checkedAt?: string;
  statusPageUrl?: string;
};

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
  resetsAt?: string;
  resetRemaining?: string;
  source?: "demo" | "local" | "api" | "token";
  connectionStatus?: "connected" | "signed-out";
  stale?: boolean;
  dataUpdatedAt?: string;
  resetTrackingId?: string;
  freshness?: UsageFreshness;
  sourceInfo?: UsageSourceInfo;
  serviceStatus?: ProviderServiceStatus;
  windows?: UsageLimitWindow[];
};

export type UsageLimitWindow = {
  id: string;
  label: string;
  percent: number;
  resetsAt?: string;
  resetRemaining?: string;
  message?: string;
  available?: boolean;
  quality?: UsageDataQuality;
  dataUpdatedAt?: string;
  windowDurationMinutes?: number;
  pace?: UsagePace;
};

export type QuietHoursSettings = {
  enabled: boolean;
  start: string;
  end: string;
};

export type ProviderNotificationSettings = {
  enabled: boolean;
  thresholds: number[];
  resetEnabled: boolean;
  projectedExhaustionEnabled: boolean;
};

export type NotificationSettings = {
  enabled: boolean;
  cooldownMinutes: number;
  quietHours: QuietHoursSettings;
  providers: Record<ProviderId, ProviderNotificationSettings>;
};

export type ProviderSettings = {
  visible: boolean;
  auth?: ProviderAuth;
};

export type ProviderAuth = {
  type: "token" | "oauth";
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  accountLabel?: string;
};

export type MeterColorBand = {
  id: string;
  upTo: number;
  color: string;
};

export type AppSettings = {
  refreshIntervalMs: number;
  menuBarDisplayMode: "icons" | "iconsWithPercent";
  theme: ThemeSetting;
  language: LanguageSetting;
  meterColorBands: MeterColorBand[];
  notifications: NotificationSettings;
  providers: Record<ProviderId, ProviderSettings>;
};

/**
 * Renderer-safe settings. Authentication material is intentionally absent from
 * this contract; the UI only needs to know whether the main process has saved
 * credentials so it can offer a logout action.
 */
export type PublicProviderSettings = {
  visible: boolean;
  hasSavedAuth: boolean;
};

export type PublicAppSettings = {
  refreshIntervalMs: number;
  menuBarDisplayMode: "icons" | "iconsWithPercent";
  theme: ThemeSetting;
  language: LanguageSetting;
  meterColorBands: MeterColorBand[];
  notifications: NotificationSettings;
  providers: Record<ProviderId, PublicProviderSettings>;
};

export type UsageSnapshot = {
  settings: PublicAppSettings;
  usage: ProviderUsage[];
};

export type UsageHistoryRange = "24h" | "7d" | "30d";

export type UsageHistoryPoint = {
  provider: ProviderId;
  windowId: string;
  windowLabel: string;
  percent: number;
  observedAt: string;
  resetsAt?: string;
  trackingId: string;
  quality: UsageDataQuality;
};

export type ProviderHistory = {
  provider: ProviderId;
  range: UsageHistoryRange;
  points: UsageHistoryPoint[];
};

export type TokenLoginPayload = {
  provider: ProviderId;
  token: string;
};

export type OAuthLoginResult = {
  provider: ProviderId;
  status: "success" | "unsupported" | "missing-config" | "error";
  message: string;
};

export type UpdateErrorCode = "metadata-missing" | "network" | "access-denied" | "invalid-release" | "unknown";

export type UpdateDiagnosticCode =
  | "UPDATE_METADATA_MISSING"
  | "UPDATE_NETWORK"
  | "UPDATE_ACCESS_DENIED"
  | "UPDATE_INTEGRITY"
  | "UPDATE_UNKNOWN";

export type UpdateStatus = {
  state: "idle" | "checking" | "available" | "downloading" | "downloaded" | "not-available";
  version?: string;
  progressPercent?: number;
  message?: string;
  manualInstallCommand?: string;
} | {
  state: "error";
  errorCode: UpdateErrorCode;
  diagnosticCode: UpdateDiagnosticCode;
};

export const DEFAULT_METER_COLOR_BANDS: MeterColorBand[] = [
  { id: "band-1", upTo: 75, color: "#3b82f6" },
  { id: "band-2", upTo: 90, color: "#f59e0b" },
  { id: "band-3", upTo: 100, color: "#dc2626" }
];

export const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: "codex", label: "Codex" },
  { id: "claude", label: "Claude" },
  { id: "gemini", label: "Gemini" }
];
