import { afterEach, describe, expect, it, vi } from "vitest";
import {
  rememberKnownServiceState,
  SERVICE_STATUS_CACHE_TTL_MS,
  SERVICE_STATUS_TIMEOUT_MS,
  ServiceStatusClient
} from "../../src/main/serviceStatus";

function summaryResponse(components: Array<{ name: string; status: string }>) {
  return new Response(
    JSON.stringify({
      page: { updated_at: "2026-08-09T08:30:00.000Z" },
      status: { indicator: "none", description: "All Systems Operational" },
      components
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ServiceStatusClient", () => {
  it("unknown 관측은 마지막으로 알려진 상태를 덮어쓰지 않는다", () => {
    const states = new Map();

    expect(rememberKnownServiceState(states, "codex", "operational")).toBeUndefined();
    expect(rememberKnownServiceState(states, "codex", "unknown")).toBe("operational");
    expect(states.get("codex")).toBe("operational");
    expect(rememberKnownServiceState(states, "codex", "outage")).toBe("operational");
    expect(states.get("codex")).toBe("outage");
  });

  it("Claude Code와 Claude API만 선별하고 5분 동안 결과를 캐시한다", async () => {
    let now = Date.parse("2026-08-09T09:00:00.000Z");
    const fetcher = vi.fn().mockResolvedValue(
      summaryResponse([
        { name: "claude.ai", status: "major_outage" },
        { name: "Claude API (api.anthropic.com)", status: "operational" },
        { name: "Claude Code", status: "degraded_performance" }
      ])
    );
    const client = new ServiceStatusClient({ fetcher, now: () => now });

    const first = await client.getProviderServiceStatus("claude");
    now += SERVICE_STATUS_CACHE_TTL_MS - 1;
    const second = await client.getProviderServiceStatus("claude");

    expect(first.components.map((component) => component.name)).toEqual([
      "Claude API (api.anthropic.com)",
      "Claude Code"
    ]);
    expect(first.state).toBe("degraded");
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("OpenAI 상태 페이지에서는 이름에 Codex가 포함된 컴포넌트만 사용한다", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      summaryResponse([
        { name: "Login", status: "major_outage" },
        { name: "Codex in ChatGPT Desktop", status: "operational" },
        { name: "Responses", status: "partial_outage" }
      ])
    );
    const client = new ServiceStatusClient({ fetcher });

    const status = await client.getProviderServiceStatus("codex");

    expect(status.state).toBe("operational");
    expect(status.components).toEqual([{ name: "Codex in ChatGPT Desktop", status: "operational" }]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://status.openai.com/api/v2/summary.json",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("알 수 없는 컴포넌트가 섞여도 확인된 장애를 우선한다", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      summaryResponse([
        { name: "Claude API", status: "새로운_상태" },
        { name: "Claude Code", status: "major_outage" }
      ])
    );
    const client = new ServiceStatusClient({ fetcher });

    expect((await client.getProviderServiceStatus("claude")).state).toBe("outage");
  });

  it("Gemini는 부정확한 광역 상태를 대신 사용하지 않고 unknown을 반환한다", async () => {
    const fetcher = vi.fn();
    const client = new ServiceStatusClient({ fetcher });

    const status = await client.getProviderServiceStatus("gemini");

    expect(status.state).toBe("unknown");
    expect(status.source).toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("만료 후 조회가 실패하면 마지막 정상 결과를 stale 상태로 유지한다", async () => {
    let now = Date.parse("2026-08-09T09:00:00.000Z");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(summaryResponse([{ name: "Claude Code", status: "operational" }]))
      .mockRejectedValueOnce(new Error("offline"));
    const client = new ServiceStatusClient({ fetcher, now: () => now });

    await client.getProviderServiceStatus("claude");
    now += SERVICE_STATUS_CACHE_TTL_MS;
    const status = await client.getProviderServiceStatus("claude");

    expect(status.state).toBe("operational");
    expect(status.source).toBe("official-status");
    expect(status.fromCache).toBe(true);
    expect(status.stale).toBe(true);
    expect(status.lastAttemptAt).toBe(new Date(now).toISOString());
  });

  it("첫 조회 실패와 15초 timeout은 unknown으로 안전하게 끝난다", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        })
    );
    const client = new ServiceStatusClient({ fetcher });

    const pending = client.getProviderServiceStatus("codex");
    await vi.advanceTimersByTimeAsync(SERVICE_STATUS_TIMEOUT_MS);
    const status = await pending;

    expect(status.state).toBe("unknown");
    expect(status.source).toBe("unavailable");
  });
});
