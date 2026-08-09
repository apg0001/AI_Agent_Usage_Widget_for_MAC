import { ProviderId, UsageSnapshot } from "../shared/types.js";
import { ProviderServiceStatus } from "./serviceStatus.js";

export type DiagnosticsAppMetadata = {
  appName?: string;
  appVersion: string;
  platform: string;
  arch: string;
  electronVersion?: string;
  generatedAt?: string;
  serviceStatuses?: Partial<Record<ProviderId, ProviderServiceStatus>>;
};

export type DiagnosticsReport = ReturnType<typeof createDiagnosticsReport>;

function safeServiceStatus(status: ProviderServiceStatus | undefined) {
  if (!status) {
    return undefined;
  }

  return {
    state: status.state,
    source: status.source,
    sourceUrl: status.sourceUrl,
    components: status.components.map((component) => ({
      name: component.name,
      status: component.status
    })),
    checkedAt: status.checkedAt,
    pageUpdatedAt: status.pageUpdatedAt,
    lastAttemptAt: status.lastAttemptAt,
    fromCache: status.fromCache,
    stale: status.stale
  };
}

export function createDiagnosticsReport(snapshot: UsageSnapshot, metadata: DiagnosticsAppMetadata) {
  return {
    schemaVersion: 1,
    generatedAt: metadata.generatedAt ?? new Date().toISOString(),
    app: {
      name: metadata.appName ?? "Quota Bar",
      version: metadata.appVersion,
      platform: metadata.platform,
      arch: metadata.arch,
      electronVersion: metadata.electronVersion
    },
    settings: {
      refreshIntervalMs: snapshot.settings.refreshIntervalMs,
      menuBarDisplayMode: snapshot.settings.menuBarDisplayMode,
      providers: {
        codex: { visible: snapshot.settings.providers.codex.visible },
        claude: { visible: snapshot.settings.providers.claude.visible },
        gemini: { visible: snapshot.settings.providers.gemini.visible }
      }
    },
    providers: snapshot.usage.map((usage) => ({
      provider: usage.provider,
      status: usage.status,
      percent: usage.percent,
      unit: usage.unit,
      source: usage.source,
      connectionStatus: usage.connectionStatus,
      stale: Boolean(usage.stale),
      updatedAt: usage.updatedAt,
      dataUpdatedAt: usage.dataUpdatedAt,
      resetsAt: usage.resetsAt,
      windows: usage.windows?.map((window) => ({
        id: window.id,
        label: window.label,
        percent: window.percent,
        resetsAt: window.resetsAt
      })),
      service: safeServiceStatus(metadata.serviceStatuses?.[usage.provider])
    }))
  };
}

export function serializeDiagnosticsReport(snapshot: UsageSnapshot, metadata: DiagnosticsAppMetadata) {
  return JSON.stringify(createDiagnosticsReport(snapshot, metadata), null, 2);
}
