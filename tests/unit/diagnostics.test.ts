import { describe, expect, it } from "vitest";
import { createDiagnosticsReport, serializeDiagnosticsReport } from "../../src/main/diagnostics";
import { UsageSnapshot } from "../../src/shared/types";

function snapshotWithSecrets(): UsageSnapshot {
  return {
    settings: {
      refreshIntervalMs: 10_000,
      menuBarDisplayMode: "iconsWithPercent",
      providers: {
        codex: {
          visible: true,
          auth: {
            type: "token",
            accessToken: "super-secret-access-token",
            refreshToken: "super-secret-refresh-token",
            accountLabel: "private@example.com"
          }
        },
        claude: { visible: true },
        gemini: { visible: false }
      }
    },
    usage: [
      {
        provider: "codex",
        label: "Codex",
        used: 321,
        limit: 500,
        unit: "credits",
        percent: 64,
        status: "warning",
        updatedAt: "2026-08-09T09:00:00.000Z",
        dataUpdatedAt: "2026-08-09T08:59:00.000Z",
        source: "local",
        stale: false,
        resetTrackingId: "private-account-fingerprint",
        message: "Credential found under C:\\Users\\private-user\\.codex",
        windows: [
          {
            id: "primary",
            label: "5시간 한도",
            percent: 64,
            resetsAt: "2026-08-09T12:00:00.000Z",
            message: "C:\\Users\\private-user\\session.jsonl"
          }
        ]
      }
    ]
  };
}

describe("diagnostics", () => {
  it("문제 해결에 필요한 사용률과 freshness만 남긴다", () => {
    const report = createDiagnosticsReport(snapshotWithSecrets(), {
      appVersion: "0.2.0",
      platform: "win32",
      arch: "x64",
      electronVersion: "33.2.1",
      generatedAt: "2026-08-09T09:01:00.000Z",
      serviceStatuses: {
        codex: {
          provider: "codex",
          state: "operational",
          components: [{ name: "Codex", status: "operational" }],
          source: "official-status",
          sourceUrl: "https://status.openai.com/api/v2/summary.json",
          checkedAt: "2026-08-09T09:00:30.000Z",
          fromCache: true,
          stale: false
        }
      }
    });

    expect(report.settings.providers.codex).toEqual({ visible: true });
    expect(report.providers[0]).toMatchObject({
      provider: "codex",
      percent: 64,
      source: "local",
      stale: false,
      service: { state: "operational", fromCache: true }
    });
    expect(report.providers[0].windows).toEqual([
      {
        id: "primary",
        label: "5시간 한도",
        percent: 64,
        resetsAt: "2026-08-09T12:00:00.000Z"
      }
    ]);
  });

  it("auth, token, 계정 라벨, 홈 경로와 reset tracking id를 직렬화하지 않는다", () => {
    const serialized = serializeDiagnosticsReport(snapshotWithSecrets(), {
      appVersion: "0.2.0",
      platform: "win32",
      arch: "x64",
      generatedAt: "2026-08-09T09:01:00.000Z"
    });

    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain("private-account-fingerprint");
    expect(serialized).not.toContain("private-user");
    expect(serialized).not.toContain('"auth"');
    expect(serialized).not.toContain("accountLabel");
    expect(serialized).not.toContain("resetTrackingId");
  });
});
