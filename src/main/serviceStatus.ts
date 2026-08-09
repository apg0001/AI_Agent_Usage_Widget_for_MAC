import { ProviderId } from "../shared/types.js";

export const SERVICE_STATUS_CACHE_TTL_MS = 5 * 60_000;
export const SERVICE_STATUS_TIMEOUT_MS = 15_000;

export type ServiceState = "operational" | "maintenance" | "degraded" | "outage" | "unknown";

export type ServiceComponentStatus = {
  name: string;
  status: string;
};

export type ProviderServiceStatus = {
  provider: ProviderId;
  state: ServiceState;
  components: ServiceComponentStatus[];
  source: "official-status" | "unavailable";
  sourceUrl?: string;
  description?: string;
  checkedAt: string;
  pageUpdatedAt?: string;
  lastAttemptAt?: string;
  fromCache: boolean;
  stale: boolean;
};

export function rememberKnownServiceState(
  states: Map<ProviderId, ServiceState>,
  provider: ProviderId,
  current: ServiceState
) {
  const previous = states.get(provider);
  if (current !== "unknown") {
    states.set(provider, current);
  }
  return previous;
}

type StatusPageSummary = {
  page?: {
    updated_at?: string;
  };
  status?: {
    indicator?: string;
    description?: string;
  };
  components?: Array<{
    name?: string;
    status?: string;
  }>;
};

type ServiceStatusFetcher = (
  url: string,
  init: {
    headers: Record<string, string>;
    signal: AbortSignal;
  }
) => Promise<Response>;

type ServiceStatusClientOptions = {
  fetcher?: ServiceStatusFetcher;
  now?: () => number;
  cacheTtlMs?: number;
  timeoutMs?: number;
};

type CachedServiceStatus = {
  fetchedAt: number;
  status: ProviderServiceStatus;
};

const STATUS_URLS: Partial<Record<ProviderId, string>> = {
  claude: "https://status.claude.com/api/v2/summary.json",
  codex: "https://status.openai.com/api/v2/summary.json"
};

function isSelectedComponent(provider: ProviderId, name: string) {
  const normalized = name.trim().toLowerCase();

  if (provider === "claude") {
    return normalized.includes("claude code") || normalized.includes("claude api") || normalized.includes("api.anthropic.com");
  }
  if (provider === "codex") {
    return normalized.includes("codex");
  }
  return false;
}

function componentState(status: string): ServiceState {
  switch (status.trim().toLowerCase()) {
    case "operational":
      return "operational";
    case "under_maintenance":
      return "maintenance";
    case "degraded_performance":
    case "partial_outage":
      return "degraded";
    case "major_outage":
      return "outage";
    default:
      return "unknown";
  }
}

function overallState(components: ServiceComponentStatus[]): ServiceState {
  const states = components.map((component) => componentState(component.status));
  if (states.includes("outage")) {
    return "outage";
  }
  if (states.includes("degraded")) {
    return "degraded";
  }
  if (states.includes("maintenance")) {
    return "maintenance";
  }
  if (states.includes("unknown")) {
    return "unknown";
  }
  return states.length > 0 ? "operational" : "unknown";
}

function unavailableStatus(provider: ProviderId, now: number): ProviderServiceStatus {
  const checkedAt = new Date(now).toISOString();
  return {
    provider,
    state: "unknown",
    components: [],
    source: "unavailable",
    checkedAt,
    lastAttemptAt: checkedAt,
    fromCache: false,
    stale: false
  };
}

function parseStatusPage(
  provider: ProviderId,
  sourceUrl: string,
  summary: StatusPageSummary,
  checkedAt: string
): ProviderServiceStatus {
  if (!Array.isArray(summary.components)) {
    throw new Error("Status page response has no components.");
  }

  const components = summary.components
    .filter(
      (component): component is { name: string; status: string } =>
        typeof component.name === "string" &&
        typeof component.status === "string" &&
        isSelectedComponent(provider, component.name)
    )
    .map((component) => ({ name: component.name, status: component.status }));

  if (components.length === 0) {
    throw new Error(`No ${provider} component was found on the status page.`);
  }

  return {
    provider,
    state: overallState(components),
    components,
    source: "official-status",
    sourceUrl,
    description: summary.status?.description,
    checkedAt,
    pageUpdatedAt: summary.page?.updated_at,
    fromCache: false,
    stale: false
  };
}

export class ServiceStatusClient {
  private readonly fetcher: ServiceStatusFetcher;
  private readonly now: () => number;
  private readonly cacheTtlMs: number;
  private readonly timeoutMs: number;
  private readonly cache = new Map<ProviderId, CachedServiceStatus>();
  private readonly inFlight = new Map<ProviderId, Promise<ProviderServiceStatus>>();

  constructor(options: ServiceStatusClientOptions = {}) {
    this.fetcher = options.fetcher ?? ((url, init) => globalThis.fetch(url, init));
    this.now = options.now ?? (() => Date.now());
    this.cacheTtlMs = options.cacheTtlMs ?? SERVICE_STATUS_CACHE_TTL_MS;
    this.timeoutMs = options.timeoutMs ?? SERVICE_STATUS_TIMEOUT_MS;
  }

  async getProviderServiceStatus(provider: ProviderId): Promise<ProviderServiceStatus> {
    const sourceUrl = STATUS_URLS[provider];
    if (!sourceUrl) {
      return unavailableStatus(provider, this.now());
    }

    const now = this.now();
    const cached = this.cache.get(provider);
    if (cached && now >= cached.fetchedAt && now - cached.fetchedAt < this.cacheTtlMs) {
      return {
        ...cached.status,
        fromCache: true
      };
    }

    const currentRequest = this.inFlight.get(provider);
    if (currentRequest) {
      return currentRequest;
    }

    const request = this.fetchStatus(provider, sourceUrl);
    this.inFlight.set(provider, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(provider);
    }
  }

  async getAllProviderServiceStatuses(): Promise<Record<ProviderId, ProviderServiceStatus>> {
    const [codex, claude, gemini] = await Promise.all([
      this.getProviderServiceStatus("codex"),
      this.getProviderServiceStatus("claude"),
      this.getProviderServiceStatus("gemini")
    ]);
    return { codex, claude, gemini };
  }

  private async fetchStatus(provider: ProviderId, sourceUrl: string): Promise<ProviderServiceStatus> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const attemptAt = this.now();

    try {
      const response = await this.fetcher(sourceUrl, {
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Status page request failed with ${response.status}.`);
      }

      const summary = (await response.json()) as StatusPageSummary;
      const fetchedAt = this.now();
      const status = parseStatusPage(provider, sourceUrl, summary, new Date(fetchedAt).toISOString());
      this.cache.set(provider, { fetchedAt, status });
      return status;
    } catch {
      const fallback = this.cache.get(provider);
      if (fallback) {
        return {
          ...fallback.status,
          lastAttemptAt: new Date(attemptAt).toISOString(),
          fromCache: true,
          stale: true
        };
      }
      return unavailableStatus(provider, attemptAt);
    } finally {
      clearTimeout(timeout);
    }
  }
}

const defaultServiceStatusClient = new ServiceStatusClient();

export function getProviderServiceStatus(provider: ProviderId) {
  return defaultServiceStatusClient.getProviderServiceStatus(provider);
}

export function getAllProviderServiceStatuses() {
  return defaultServiceStatusClient.getAllProviderServiceStatuses();
}
