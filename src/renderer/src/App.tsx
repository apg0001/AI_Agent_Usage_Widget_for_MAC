import { Check, KeyRound, LogOut, Power, RefreshCw } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { ProviderAuth, ProviderId, ProviderUsage, PROVIDERS, TokenLoginPayload, UsageSnapshot } from "../../shared/types";
import "./styles.css";

const statusLabel: Record<ProviderUsage["status"], string> = {
  ok: "정상",
  warning: "주의",
  critical: "임박",
  "signed-out": "미로그인",
  error: "오류"
};

const loginHelp: Record<ProviderId, string> = {
  codex: "Codex CLI 로그인이 없으면 토큰을 저장할 수 있습니다.",
  claude: "Claude Code에서 로그인하면 자동으로 확인합니다.",
  gemini: "터미널에서 gemini를 실행해 브라우저 로그인을 마치면 자동 감지됩니다."
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

function OAuthLoginButton({
  provider,
  busy,
  onOAuthLogin
}: {
  provider: ProviderId;
  busy: boolean;
  onOAuthLogin: (provider: ProviderId) => Promise<void>;
}) {
  return (
    <button className="oauth-login-button" type="button" onClick={() => onOAuthLogin(provider)} disabled={busy}>
      <KeyRound size={14} />
      Google OAuth 로그인
    </button>
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
  savedAuth,
  busy,
  onTokenLogin,
  onOAuthLogin,
  onLogout,
  help
}: {
  usage: ProviderUsage;
  savedAuth?: ProviderAuth;
  busy: boolean;
  onTokenLogin: (payload: TokenLoginPayload) => Promise<void>;
  onOAuthLogin: (provider: ProviderId) => Promise<void>;
  onLogout: (provider: ProviderId) => Promise<void>;
  help: string;
}) {
  const hasSavedAuth = Boolean(savedAuth);
  const isConnected = hasSavedAuth || usage.source === "local" || usage.source === "api" || usage.source === "token";
  const canUseOAuth = usage.provider === "gemini";
  const canUseToken = usage.provider === "codex";
  const windows = usage.windows ?? [];
  const hasWindows = windows.length > 0;
  const helperMessage = usage.status === "signed-out" || usage.status === "error" || usage.provider === "gemini" ? usage.message : undefined;

  return (
    <section className={`usage-row ${usage.status}`}>
      <div className="row-top">
        <div>
          <h2>{usage.label}</h2>
          {helperMessage ? <p>{helperMessage}</p> : null}
        </div>
        {hasSavedAuth ? (
          <button className="card-auth-button logout" type="button" onClick={() => onLogout(usage.provider)} disabled={busy}>
            <LogOut size={14} />
            로그아웃
          </button>
        ) : null}
      </div>
      {!isConnected && canUseOAuth ? (
        <OAuthLoginButton provider={usage.provider} busy={busy} onOAuthLogin={onOAuthLogin} />
      ) : null}
      {!isConnected && canUseToken ? (
        <TokenLoginForm provider={usage.provider} busy={busy} onTokenLogin={onTokenLogin} />
      ) : null}
      <strong className="status-badge">{statusLabel[usage.status]}</strong>
      {hasWindows ? (
        <div className="usage-window-list" aria-label={`${usage.label} 기간별 사용량`}>
          {windows.map((window) => (
            <div key={window.id} className="usage-window">
              <div className="usage-window-heading">
                <span>{window.label}</span>
                <strong>{window.percent}%</strong>
              </div>
              <div className="meter" aria-label={`${usage.label} ${window.label} 사용률 ${window.percent}%`}>
                <span style={{ width: `${window.percent}%` }} />
              </div>
              <small>{window.message ?? (window.resetRemaining ? `초기화까지 ${window.resetRemaining}` : "초기화 시간 없음")}</small>
            </div>
          ))}
        </div>
      ) : (
        <div className="usage-window single">
          <div className="usage-window-heading">
            <span>사용량</span>
            <strong>{usage.percent}%</strong>
          </div>
          <div className="meter" aria-label={`${usage.label} 사용률 ${usage.percent}%`}>
            <span style={{ width: `${usage.percent}%` }} />
          </div>
          <small>{usage.resetRemaining ? `초기화까지 ${usage.resetRemaining}` : formatTime(usage.updatedAt)}</small>
        </div>
      )}
      {!isConnected ? <p className="provider-help">{help}</p> : null}
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

  async function oauthLogin(provider: ProviderId) {
    setBusy(true);
    try {
      const { result, snapshot } = await window.aiUsage.oauthLogin(provider);
      setSnapshot(snapshot);
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
              savedAuth={snapshot?.settings.providers[usage.provider].auth}
              busy={busy}
              onTokenLogin={tokenLogin}
              onOAuthLogin={oauthLogin}
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
