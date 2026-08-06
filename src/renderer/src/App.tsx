import { Check, KeyRound, LogOut, Power, RefreshCw } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { ProviderId, ProviderUsage, PROVIDERS, TokenLoginPayload, UsageSnapshot } from "../../shared/types";
import "./styles.css";

const statusLabel: Record<ProviderUsage["status"], string> = {
  ok: "정상",
  warning: "주의",
  critical: "임박",
  "signed-out": "미로그인",
  error: "오류"
};

const loginHelp: Record<ProviderId, string> = {
  codex: "Codex 토큰을 저장하면 앱 재실행 후에도 로그인 상태가 유지됩니다.",
  claude: "Claude 토큰을 저장하면 앱 재실행 후에도 로그인 상태가 유지됩니다.",
  gemini: "Gemini 토큰을 저장하면 앱 재실행 후에도 로그인 상태가 유지됩니다."
};

function TokenLoginForm({
  provider,
  busy,
  onTokenLogin
}: {
  provider: ProviderId;
  busy: boolean;
  onTokenLogin: (payload: TokenLoginPayload) => Promise<void>;
}) {
  const [token, setToken] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token.trim()) {
      return;
    }

    await onTokenLogin({ provider, token: token.trim() });
    setToken("");
  }

  return (
    <form className="token-login-form" onSubmit={submit}>
      <input
        type="password"
        value={token}
        placeholder="토큰"
        aria-label={`${provider} 토큰`}
        onChange={(event) => setToken(event.target.value)}
      />
      <button type="submit" disabled={busy}>
        <KeyRound size={14} />
        로그인
      </button>
    </form>
  );
}

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
  onTokenLogin,
  onLogout,
  help
}: {
  usage: ProviderUsage;
  isAuthenticated: boolean;
  busy: boolean;
  onTokenLogin: (payload: TokenLoginPayload) => Promise<void>;
  onLogout: (provider: ProviderId) => Promise<void>;
  help: string;
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
        ) : null}
      </div>
      {!isAuthenticated ? <TokenLoginForm provider={usage.provider} busy={busy} onTokenLogin={onTokenLogin} /> : null}
      <strong className="status-badge">{statusLabel[usage.status]}</strong>
      <div className="meter" aria-label={`${usage.label} 사용률 ${usage.percent}%`}>
        <span style={{ width: `${usage.percent}%` }} />
      </div>
      <div className="row-bottom">
        <span>{usage.percent}%</span>
        <span>{formatTime(usage.updatedAt)}</span>
      </div>
      <p className="provider-help">{help}</p>
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

  async function tokenLogin(payload: TokenLoginPayload) {
    await run(() => window.aiUsage.tokenLogin(payload));
    setNotice(`${PROVIDERS.find((provider) => provider.id === payload.provider)?.label} 토큰 로그인이 저장되었습니다.`);
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
        <p className="login-guide">각 모델 카드 안에 토큰을 입력하면 로그인 상태가 유지됩니다.</p>
      </section>

      <section className="usage-list" aria-live="polite">
        {visibleUsage.length ? (
          visibleUsage.map((usage) => (
            <UsageRow
              key={usage.provider}
              usage={usage}
              isAuthenticated={Boolean(snapshot?.settings.providers[usage.provider].auth)}
              busy={busy}
              onTokenLogin={tokenLogin}
              onLogout={logout}
              help={loginHelp[usage.provider]}
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
