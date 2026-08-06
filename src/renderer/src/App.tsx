import { Check, ExternalLink, LogOut, Power, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ProviderId, ProviderUsage, PROVIDERS, UsageSnapshot } from "../../shared/types";
import "./styles.css";

const statusLabel: Record<ProviderUsage["status"], string> = {
  ok: "정상",
  warning: "주의",
  critical: "임박",
  "signed-out": "미로그인",
  error: "오류"
};

function formatTime(value?: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function UsageRow({
  usage,
  isAuthenticated,
  busy,
  onOAuthLogin,
  onLogout
}: {
  usage: ProviderUsage;
  isAuthenticated: boolean;
  busy: boolean;
  onOAuthLogin: (provider: ProviderId) => Promise<void>;
  onLogout: (provider: ProviderId) => Promise<void>;
}) {
  return (
    <section className={`usage-row ${usage.status}`}>
      <div className="row-top">
        <div>
          <h2>{usage.label}</h2>
          <p>{usage.message ?? `${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()} ${usage.unit}`}</p>
        </div>
        {isAuthenticated ? (
          <button className="card-auth-button logout" type="button" onClick={() => onLogout(usage.provider)} disabled={busy}>
            <LogOut size={14} />
            로그아웃
          </button>
        ) : (
          <button
            className="card-auth-button oauth-login"
            type="button"
            onClick={() => onOAuthLogin(usage.provider)}
            disabled={busy}
          >
            <ExternalLink size={14} />
            로그인
          </button>
        )}
      </div>
      <strong className="status-badge">{statusLabel[usage.status]}</strong>
      <div className="meter" aria-label={`${usage.label} 사용률 ${usage.percent}%`}>
        <span style={{ width: `${usage.percent}%` }} />
      </div>
      <div className="row-bottom">
        <span>{usage.percent}%</span>
        <span>{formatTime(usage.updatedAt)}</span>
      </div>
    </section>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>("codex");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void window.aiUsage.getUsage().then(setSnapshot);
    return window.aiUsage.onUsageSnapshot(setSnapshot);
  }, []);

  async function run(action: () => Promise<UsageSnapshot>) {
    setBusy(true);
    try {
      setSnapshot(await action());
    } finally {
      setBusy(false);
    }
  }

  async function setVisibility(provider: ProviderId, visible: boolean) {
    await run(() => window.aiUsage.setProviderVisibility(provider, visible));
  }

  async function oauthLogin(provider: ProviderId) {
    setBusy(true);
    try {
      const { result, snapshot: nextSnapshot } = await window.aiUsage.oauthLogin(provider);
      setSnapshot(nextSnapshot);
      setNotice(result.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout(provider: ProviderId) {
    await run(() => window.aiUsage.logout(provider));
  }

  const visibleUsage = snapshot?.usage ?? [];
  const lastUpdated = visibleUsage[0]?.updatedAt;

  return (
    <main className="shell">
      <header className="titlebar">
        <div>
          <p>AI 사용량</p>
          <h1>Menu Bar Monitor</h1>
        </div>
        <div className="toolbar">
          <button type="button" onClick={() => run(window.aiUsage.refreshUsage)} disabled={busy} title="새로고침">
            <RefreshCw size={17} className={busy ? "spin" : ""} />
          </button>
          <button type="button" onClick={window.aiUsage.quit} title="종료">
            <Power size={17} />
          </button>
        </div>
      </header>

      <section className="provider-tabs" aria-label="표시할 AI 모델 선택">
        {PROVIDERS.map((provider) => {
          const checked = snapshot?.settings.providers[provider.id].visible ?? true;
          return (
            <button
              key={provider.id}
              type="button"
              className={selectedProvider === provider.id ? "active" : ""}
              onClick={() => setSelectedProvider(provider.id)}
            >
              <span>{provider.label}</span>
              <label className="switch" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => setVisibility(provider.id, event.target.checked)}
                />
                <span>{checked ? <Check size={12} /> : null}</span>
              </label>
            </button>
          );
        })}
      </section>

      <section className="display-panel" aria-label="메뉴바 표시 설정">
        <span>메뉴바</span>
        <div className="segmented">
          <button
            type="button"
            className={snapshot?.settings.menuBarDisplayMode !== "iconsWithPercent" ? "active" : ""}
            onClick={() => run(() => window.aiUsage.setMenuBarDisplayMode("icons"))}
          >
            아이콘
          </button>
          <button
            type="button"
            className={snapshot?.settings.menuBarDisplayMode === "iconsWithPercent" ? "active" : ""}
            onClick={() => run(() => window.aiUsage.setMenuBarDisplayMode("iconsWithPercent"))}
          >
            아이콘+%
          </button>
        </div>
        {notice ? <p className="notice">{notice}</p> : null}
      </section>

      <section className="usage-list" aria-live="polite">
        {visibleUsage.length ? (
          visibleUsage.map((usage) => (
            <UsageRow
              key={usage.provider}
              usage={usage}
              isAuthenticated={Boolean(snapshot?.settings.providers[usage.provider].auth)}
              busy={busy}
              onOAuthLogin={oauthLogin}
              onLogout={logout}
            />
          ))
        ) : (
          <div className="empty">표시할 모델을 선택하세요.</div>
        )}
      </section>

      <footer>
        <span>10초마다 자동 갱신</span>
        <span>마지막 갱신 {formatTime(lastUpdated)}</span>
      </footer>
    </main>
  );
}
