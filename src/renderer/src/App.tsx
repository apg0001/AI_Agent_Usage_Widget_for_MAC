import { Check, ExternalLink, KeyRound, LogIn, LogOut, Power, RefreshCw, Settings2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { LoginPayload, ProviderId, ProviderUsage, PROVIDERS, UsageSnapshot } from "../../shared/types";
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

function UsageRow({ usage }: { usage: ProviderUsage }) {
  return (
    <section className={`usage-row ${usage.status}`}>
      <div className="row-top">
        <div>
          <h2>{usage.label}</h2>
          <p>{usage.message ?? `${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()} ${usage.unit}`}</p>
        </div>
        <strong>{statusLabel[usage.status]}</strong>
      </div>
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

function LoginForm({ provider, onLogin }: { provider: ProviderId; onLogin: (payload: LoginPayload) => Promise<void> }) {
  const [token, setToken] = useState("");
  const label = PROVIDERS.find((item) => item.id === provider)?.label ?? provider;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token.trim()) {
      return;
    }
    await onLogin({ provider, token: token.trim() });
    setToken("");
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <input
        aria-label={`${label} 토큰`}
        type="password"
        value={token}
        placeholder={`${label} 토큰`}
        onChange={(event) => setToken(event.target.value)}
      />
      <button type="submit" title={`${label} 로그인`}>
        <LogIn size={16} />
      </button>
    </form>
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

  async function login(payload: LoginPayload) {
    await run(() => window.aiUsage.login(payload));
    setNotice("API 키 로그인이 저장되었습니다.");
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
  const selectedSettings = snapshot?.settings.providers[selectedProvider];
  const selectedAuth = selectedSettings?.auth;

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

      <section className="account-panel">
        <div className="panel-heading">
          <Settings2 size={16} />
          <span>{PROVIDERS.find((provider) => provider.id === selectedProvider)?.label} 계정</span>
        </div>
        {selectedAuth ? (
          <div className="account-actions">
            <p>{selectedAuth.accountLabel ?? (selectedAuth.type === "oauth" ? "OAuth" : "API 키")}로 로그인됨</p>
            <button className="logout" type="button" onClick={() => logout(selectedProvider)}>
              <LogOut size={16} />
              로그아웃
            </button>
          </div>
        ) : (
          <div className="account-actions">
            <button className="oauth-login" type="button" onClick={() => oauthLogin(selectedProvider)} disabled={busy}>
              <ExternalLink size={16} />
              브라우저 로그인
            </button>
            <details>
              <summary>
                <KeyRound size={14} />
                API 키로 로그인
              </summary>
              <LoginForm provider={selectedProvider} onLogin={login} />
            </details>
          </div>
        )}
        {notice ? <p className="notice">{notice}</p> : null}
      </section>

      <section className="usage-list" aria-live="polite">
        {visibleUsage.length ? (
          visibleUsage.map((usage) => <UsageRow key={usage.provider} usage={usage} />)
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
