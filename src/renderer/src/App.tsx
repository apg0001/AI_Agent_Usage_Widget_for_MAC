import {
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  CircleHelp,
  Clipboard,
  ExternalLink,
  KeyRound,
  LogOut,
  Power,
  RefreshCw,
  Settings,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  NotificationSettings,
  ProviderHistory,
  ProviderId,
  ProviderNotificationSettings,
  ProviderUsage,
  PROVIDERS,
  TokenLoginPayload,
  UsageHistoryRange,
  UsageLimitWindow,
  UsageSnapshot
} from "../../shared/types";
import { buildHistoryAxisTicks, normalizeHistoryPoints } from "./historyAxis";
import "./styles.css";

type View =
  | { kind: "overview" }
  | { kind: "provider"; provider: ProviderId }
  | { kind: "settings" };

type OverviewFocusKey = `provider:${ProviderId}` | "settings-toolbar" | "settings-empty";

const statusLabel: Record<ProviderUsage["status"], string> = {
  ok: "정상",
  warning: "주의",
  critical: "임박",
  "signed-out": "미로그인",
  error: "오류"
};

const serviceStatusLabel: Record<NonNullable<ProviderUsage["serviceStatus"]>["state"], string> = {
  operational: "서비스 정상",
  degraded: "일부 지연",
  outage: "서비스 장애",
  unknown: "상태 확인 중"
};

const sourceFallbackLabel: Record<NonNullable<ProviderUsage["source"]>, string> = {
  demo: "예시 데이터",
  local: "로컬 세션",
  api: "제공자 사용량 API",
  token: "저장된 토큰"
};

const sourceModeLabel: Record<NonNullable<ProviderUsage["sourceInfo"]>["mode"], string> = {
  local: "로컬",
  poll: "주기 조회",
  cache: "캐시",
  estimate: "추정"
};

const cooldownOptions = [5, 15, 30, 60];
const historyRangeLabels: Record<UsageHistoryRange, string> = {
  "24h": "24시간",
  "7d": "7일",
  "30d": "30일"
};

const loginHelp: Record<ProviderId, string> = {
  codex: "Codex CLI에서 로그인하거나 아래에 토큰을 입력하세요.",
  claude: "Claude Code를 열고 /login을 실행하세요.",
  gemini: "Gemini CLI 로그인 또는 Google OAuth로 연결하세요."
};

function formatTime(value?: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function refreshIntervalLabel(value?: number) {
  if (!value) {
    return "자동 갱신";
  }
  return value < 60_000 ? `${value / 1_000}초마다 갱신` : `${value / 60_000}분마다 갱신`;
}

function providerWindows(usage: ProviderUsage): UsageLimitWindow[] {
  if (usage.windows?.length) {
    return usage.windows;
  }

  return [
    {
      id: "total",
      label: "사용량",
      percent: usage.percent,
      resetsAt: usage.resetsAt,
      resetRemaining: usage.resetRemaining,
      available: usage.status !== "signed-out" && usage.status !== "error"
    }
  ];
}

function windowIsAvailable(window: UsageLimitWindow) {
  return window.available !== false && window.quality !== "unavailable";
}

function meterTone(percent: number, status?: ProviderUsage["status"]) {
  if (status === "signed-out" || status === "error") {
    return "muted";
  }
  if (percent >= 90) {
    return "critical";
  }
  if (percent >= 75) {
    return "warning";
  }
  return "ok";
}

function getWindowElapsedPercent(window: UsageLimitWindow) {
  if (!window.windowDurationMinutes || !window.resetsAt) {
    return undefined;
  }

  const resetAt = new Date(window.resetsAt).getTime();
  const durationMs = window.windowDurationMinutes * 60_000;
  if (!Number.isFinite(resetAt) || durationMs <= 0) {
    return undefined;
  }

  const startedAt = resetAt - durationMs;
  return Math.min(100, Math.max(0, ((Date.now() - startedAt) / durationMs) * 100));
}

function Toggle({
  checked,
  disabled,
  label,
  onChange
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden="true">{checked ? <Check size={12} /> : null}</span>
    </label>
  );
}

function UsageAnalysisHelp() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function closeOnWindowBlur() {
      if (dialogRef.current?.open) {
        dialogRef.current.close();
      }
    }

    window.addEventListener("blur", closeOnWindowBlur);
    return () => window.removeEventListener("blur", closeOnWindowBlur);
  }, []);

  function openHelp() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) {
      return;
    }

    dialog.showModal();
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
  }

  function closeHelp() {
    dialogRef.current?.close();
  }

  function closeFromBackdrop(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      closeHelp();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        className="analysis-help-trigger"
        type="button"
        aria-label="사용량 분석 방식 보기"
        aria-haspopup="dialog"
        aria-controls="usage-analysis-help"
        title="사용량 분석 방식"
        onClick={openHelp}
      >
        <CircleHelp size={16} aria-hidden="true" />
      </button>
      <dialog
        ref={dialogRef}
        id="usage-analysis-help"
        className="analysis-dialog"
        aria-modal="true"
        aria-labelledby="analysis-help-title"
        aria-describedby="analysis-help-intro"
        onClick={closeFromBackdrop}
        onClose={() => triggerRef.current?.focus()}
      >
        <div className="analysis-dialog-panel">
          <header className="analysis-dialog-header">
            <div>
              <span className="eyebrow">HOW IT WORKS</span>
              <h2 id="analysis-help-title">사용량을 이렇게 분석합니다</h2>
            </div>
            <button
              ref={closeButtonRef}
              className="analysis-dialog-close"
              type="button"
              aria-label="분석 방식 설명 닫기"
              onClick={closeHelp}
            >
              <X size={17} aria-hidden="true" />
            </button>
          </header>
          <div
            className="analysis-dialog-body"
            role="region"
            aria-label="사용량 분석 설명"
            tabIndex={0}
          >
            <p id="analysis-help-intro">
              제공자가 보고한 사용률과 Quota Bar가 쌓은 정상 이력을 함께 해석합니다.
            </p>
            <ol className="analysis-steps">
              <li>
                <span aria-hidden="true">1</span>
                <div>
                  <strong>기간 경과선</strong>
                  <p>초기화 시각과 한도 길이로 현재 기간의 경과율을 계산해 막대 위 세로선으로 표시합니다.</p>
                </div>
              </li>
              <li>
                <span aria-hidden="true">2</span>
                <div>
                  <strong>정상 이력만 사용</strong>
                  <p>오류·미로그인·오래된 캐시는 빼고, 식별할 수 있는 같은 계정·한도·초기화 주기의 0~100% 기록만 비교합니다.</p>
                </div>
              </li>
              <li>
                <span aria-hidden="true">3</span>
                <div>
                  <strong>소진 추세 계산</strong>
                  <p>최소 2개 기록이 5분 이상 쌓이면 시간당 소진율을 계산합니다. 초기화 시각을 알면 그 전에 100%에 닿을 때, 모르면 현재 증가 추세로 예상 시각을 표시합니다.</p>
                </div>
              </li>
              <li>
                <span aria-hidden="true">4</span>
                <div>
                  <strong>정상 0% 변화만 감지</strong>
                  <p>정상 응답에서 이전 값이 0%보다 높았다가 0%가 된 경우에만 초기화로 감지합니다.</p>
                </div>
              </li>
            </ol>
            <p className="analysis-caveat">
              예측은 최근 사용 패턴을 직선 추세로 본 참고값입니다. 모델 변경, 병렬 작업, 제공자의 집계 지연에 따라 실제 결과와 달라질 수 있습니다.
            </p>
          </div>
        </div>
      </dialog>
    </>
  );
}

function WindowMeter({ usage, window, compact = false }: { usage: ProviderUsage; window: UsageLimitWindow; compact?: boolean }) {
  const available = windowIsAvailable(window);
  const percent = available ? Math.min(100, Math.max(0, Math.round(window.percent))) : 0;
  const description = window.message ?? (window.resetRemaining ? `초기화까지 ${window.resetRemaining}` : "초기화 시간 없음");
  const elapsedPercent = compact ? undefined : getWindowElapsedPercent(window);
  const roundedElapsedPercent = elapsedPercent === undefined ? undefined : Math.round(elapsedPercent);
  const markerPosition = elapsedPercent === undefined ? undefined : Math.min(99.5, Math.max(0.5, elapsedPercent));

  return (
    <div className={`window-meter${compact ? " compact" : ""}`}>
      <div className="window-meter-heading">
        <span>{window.label}</span>
        <strong>{available ? `${percent}%` : "—"}</strong>
      </div>
      <div
        className="meter"
        role="progressbar"
        aria-label={`${usage.label} ${window.label} 사용률`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={available ? percent : undefined}
        aria-valuetext={available
          ? `${percent}% 사용${roundedElapsedPercent === undefined ? "" : `, 현재 한도 기간 ${roundedElapsedPercent}% 경과`}`
          : "사용량 정보 없음"}
      >
        <span className={`meter-fill ${meterTone(percent, usage.status)}`} style={{ width: `${percent}%` }} />
        {markerPosition === undefined ? null : (
          <span className="period-marker" style={{ left: `${markerPosition}%` }} aria-hidden="true" />
        )}
      </div>
      <div className="meter-meta">
        <small title={description}>{description}</small>
        {roundedElapsedPercent === undefined ? null : (
          <small className="period-legend">
            <span aria-hidden="true" />
            기간 {roundedElapsedPercent}% 경과
          </small>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ usage }: { usage: ProviderUsage }) {
  return (
    <span
      className={`status-badge status-${usage.status}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="sr-only">{usage.label} 상태: </span>
      {statusLabel[usage.status]}
    </span>
  );
}

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
        placeholder="액세스 토큰"
        aria-label={`${provider} 액세스 토큰`}
        autoComplete="off"
        onChange={(event) => setToken(event.target.value)}
      />
      <button className="primary-button" type="submit" disabled={busy || !token.trim()}>
        <KeyRound size={14} aria-hidden="true" />
        연결
      </button>
    </form>
  );
}

function AuthActions({
  usage,
  hasSavedAuth,
  busy,
  onTokenLogin,
  onOAuthLogin,
  onLogout
}: {
  usage: ProviderUsage;
  hasSavedAuth: boolean;
  busy: boolean;
  onTokenLogin: (payload: TokenLoginPayload) => Promise<void>;
  onOAuthLogin: (provider: ProviderId) => Promise<void>;
  onLogout: (provider: ProviderId) => Promise<void>;
}) {
  const inferredConnection = hasSavedAuth || ["local", "api", "token"].includes(usage.source ?? "");
  const connected = usage.connectionStatus ? usage.connectionStatus === "connected" : inferredConnection;

  if (connected && !hasSavedAuth) {
    return null;
  }

  return (
    <section className="detail-card auth-card" aria-labelledby="auth-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">연결</span>
          <h2 id="auth-heading">{connected ? "저장된 계정" : "로그인이 필요합니다"}</h2>
        </div>
        {hasSavedAuth ? (
          <button className="danger-button" type="button" disabled={busy} onClick={() => onLogout(usage.provider)}>
            <LogOut size={14} aria-hidden="true" />
            로그아웃
          </button>
        ) : null}
      </div>
      {!connected ? <p className="supporting-text">{loginHelp[usage.provider]}</p> : null}
      {!connected && usage.provider === "codex" ? (
        <TokenLoginForm provider={usage.provider} busy={busy} onTokenLogin={onTokenLogin} />
      ) : null}
      {!connected && usage.provider === "gemini" ? (
        <button className="primary-button full-button" type="button" disabled={busy} onClick={() => onOAuthLogin(usage.provider)}>
          <KeyRound size={14} aria-hidden="true" />
          Google OAuth로 연결
        </button>
      ) : null}
    </section>
  );
}

function ProviderCard({
  usage,
  buttonRef,
  onOpen
}: {
  usage: ProviderUsage;
  buttonRef: (element: HTMLButtonElement | null) => void;
  onOpen: (provider: ProviderId) => void;
}) {
  const windows = providerWindows(usage).slice(0, 2);
  const shortMessage = usage.status === "signed-out" || usage.status === "error" || usage.stale ? usage.message : undefined;

  return (
    <article className={`provider-card provider-${usage.status}`}>
      <div className="provider-card-heading">
        <div className="provider-title">
          <h2>{usage.label}</h2>
          <StatusBadge usage={usage} />
        </div>
        <button
          ref={buttonRef}
          className="detail-button"
          type="button"
          aria-label={`${usage.label} 상세 보기`}
          onClick={() => onOpen(usage.provider)}
        >
          상세
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>
      {shortMessage ? <p className="compact-message" title={shortMessage}>{shortMessage}</p> : null}
      <div className="compact-windows">
        {windows.map((window) => <WindowMeter key={window.id} usage={usage} window={window} compact />)}
      </div>
    </article>
  );
}

function HistoryChart({
  usage,
  history,
  loading,
  range
}: {
  usage: ProviderUsage;
  history?: ProviderHistory;
  loading: boolean;
  range: UsageHistoryRange;
}) {
  const primaryWindowId = providerWindows(usage)[0]?.id;
  const points = useMemo(
    () => normalizeHistoryPoints((history?.points ?? []).filter((point) => point.windowId === primaryWindowId)),
    [history?.points, primaryWindowId]
  );

  const geometry = useMemo(() => {
    if (points.length < 2) {
      return null;
    }

    const times = points.map((point) => new Date(point.observedAt).getTime());
    const first = Math.min(...times);
    const last = Math.max(...times);
    const span = Math.max(1, last - first);
    const coordinates = points.map((point, index) => {
      const observedAt = times[index];
      const x = 8 + ((observedAt - first) / span) * 304;
      const y = 62 - Math.min(100, Math.max(0, point.percent)) * 0.54;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return {
      line: coordinates.join(" "),
      area: `8,66 ${coordinates.join(" ")} 312,66`,
      min: Math.min(...points.map((point) => point.percent)),
      max: Math.max(...points.map((point) => point.percent)),
      ticks: buildHistoryAxisTicks(points, range)
    };
  }, [points, range]);

  if (!geometry) {
    return (
      <div className="history-empty" role="status">
        <span className={loading ? "loading-dot" : "learning-dot"} aria-hidden="true" />
        <div>
          <strong>{loading ? "기록 불러오는 중" : "사용 패턴 학습 중"}</strong>
          <p>{loading ? "최근 기록을 확인하고 있습니다." : "사용량이 두 번 이상 수집되면 그래프가 나타납니다."}</p>
        </div>
      </div>
    );
  }

  const firstTick = geometry.ticks[0];
  const lastTick = geometry.ticks.at(-1);
  const observedRangeLabel = firstTick && lastTick
    ? `, ${firstTick.fullLabel}부터 ${lastTick.fullLabel}까지`
    : "";

  return (
    <div className="history-chart">
      <svg
        viewBox="0 0 320 70"
        role="img"
        aria-label={`${usage.label} 최근 ${historyRangeLabels[range]} 사용률${observedRangeLabel}, 최저 ${Math.round(geometry.min)}%, 최고 ${Math.round(geometry.max)}%`}
        preserveAspectRatio="none"
      >
        <line x1="8" x2="312" y1="8" y2="8" className="chart-guide" />
        <line x1="8" x2="312" y1="35" y2="35" className="chart-guide" />
        <line x1="8" x2="312" y1="62" y2="62" className="chart-guide" />
        <polygon points={geometry.area} className="chart-area" />
        <polyline points={geometry.line} className="chart-line" />
      </svg>
      <div className="history-time-axis" aria-hidden="true">
        {geometry.ticks.map((tick) => (
          <time
            key={`${tick.position}-${tick.timestamp}`}
            dateTime={tick.timestamp}
            data-position={tick.position}
            title={tick.fullLabel}
          >
            {tick.label}
          </time>
        ))}
      </div>
      <p className="history-summary">최저 {Math.round(geometry.min)}% · 최고 {Math.round(geometry.max)}% · {points.length}개 기록</p>
    </div>
  );
}

function PaceSummary({ usage }: { usage: ProviderUsage }) {
  const windows = providerWindows(usage);
  const paceWindow =
    windows.find((window) => window.pace?.estimatedExhaustedAt) ??
    windows.find((window) => window.pace?.projectedPercentAtReset !== undefined) ??
    windows.find((window) => window.pace);
  const pace = paceWindow?.pace;

  if (!pace || pace.confidence === "insufficient") {
    return (
      <div className="pace-content learning">
        <span className="pace-orb" aria-hidden="true" />
        <div>
          <strong>소진 속도를 학습 중입니다</strong>
          <p>{pace?.sampleCount ? `${pace.sampleCount}개 기록 수집됨` : "기록이 쌓이면 초기화 시점의 예상 사용률을 알려드려요."}</p>
        </div>
      </div>
    );
  }

  const projected = pace.projectedPercentAtReset === undefined ? undefined : Math.max(0, Math.round(pace.projectedPercentAtReset));
  const rate = pace.burnRatePercentPerHour;

  return (
    <div className="pace-content">
      <span className={`pace-orb${projected !== undefined && projected >= 100 ? " danger" : ""}`} aria-hidden="true" />
      <div>
        <span className="eyebrow">{paceWindow?.label}</span>
        <strong>
          {pace.estimatedExhaustedAt
            ? `${formatDateTime(pace.estimatedExhaustedAt)} 소진 예상`
            : projected === undefined
              ? "예상치 계산 중"
              : `초기화 시점 약 ${projected}% 예상`}
        </strong>
        <p>{rate === undefined ? `${pace.sampleCount}개 기록 기반` : `시간당 ${rate.toFixed(1)}% · ${pace.sampleCount}개 기록 기반`}</p>
      </div>
    </div>
  );
}

function ProviderAlertSettings({
  usage,
  settings,
  globalEnabled,
  busy,
  onChange
}: {
  usage: ProviderUsage;
  settings: ProviderNotificationSettings;
  globalEnabled: boolean;
  busy: boolean;
  onChange: (settings: ProviderNotificationSettings) => Promise<void>;
}) {
  function toggleThreshold(threshold: number, enabled: boolean) {
    const thresholds = enabled
      ? Array.from(new Set([...settings.thresholds, threshold])).sort((a, b) => a - b)
      : settings.thresholds.filter((value) => value !== threshold);
    void onChange({ ...settings, thresholds });
  }

  return (
    <details className="disclosure-card">
      <summary>
        <span>
          <Bell size={15} aria-hidden="true" />
          알림 설정
        </span>
        <small>{settings.enabled && globalEnabled ? "켜짐" : "꺼짐"}</small>
      </summary>
      <div className="disclosure-content">
        {!globalEnabled ? <p className="inline-note">전체 알림이 꺼져 있습니다. 설정 화면에서 먼저 켜주세요.</p> : null}
        <div className="setting-row compact-setting-row">
          <div>
            <strong>{usage.label} 알림</strong>
            <small>이 제공자의 알림만 켜거나 끕니다.</small>
          </div>
          <Toggle
            checked={settings.enabled}
            disabled={busy || !globalEnabled}
            label={`${usage.label} 알림`}
            onChange={(enabled) => void onChange({ ...settings, enabled })}
          />
        </div>
        <fieldset className="threshold-fieldset" disabled={busy || !globalEnabled || !settings.enabled}>
          <legend>사용률 경고</legend>
          <div className="threshold-options">
            {[75, 90, 100].map((threshold) => (
              <label key={threshold} className="check-chip">
                <input
                  type="checkbox"
                  checked={settings.thresholds.includes(threshold)}
                  onChange={(event) => toggleThreshold(threshold, event.target.checked)}
                />
                <span>{threshold}%</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="check-row">
          <input
            type="checkbox"
            checked={settings.resetEnabled}
            disabled={busy || !globalEnabled || !settings.enabled}
            onChange={(event) => void onChange({ ...settings, resetEnabled: event.target.checked })}
          />
          한도가 초기화되면 알림
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={settings.projectedExhaustionEnabled}
            disabled={busy || !globalEnabled || !settings.enabled}
            onChange={(event) => void onChange({ ...settings, projectedExhaustionEnabled: event.target.checked })}
          />
          초기화 전에 소진될 것으로 예상되면 알림
        </label>
      </div>
    </details>
  );
}

function DataStatus({ usage, onOpenStatusPage }: { usage: ProviderUsage; onOpenStatusPage: (provider: ProviderId) => void }) {
  const sourceLabel = usage.sourceInfo?.label ?? (usage.source ? sourceFallbackLabel[usage.source] : "알 수 없음");
  const sourceMode = usage.sourceInfo?.mode ? sourceModeLabel[usage.sourceInfo.mode] : undefined;
  const observedAt = usage.freshness?.observedAt ?? usage.dataUpdatedAt;
  const receivedAt = usage.freshness?.receivedAt ?? usage.updatedAt;
  const service = usage.serviceStatus;

  return (
    <details className="disclosure-card">
      <summary>
        <span>데이터 상태</span>
        <small>{usage.stale ? "캐시 표시 중" : sourceLabel}</small>
      </summary>
      <div className="disclosure-content data-grid">
        <div><span>출처</span><strong>{sourceLabel}{sourceMode ? ` · ${sourceMode}` : ""}</strong></div>
        <div><span>원본 관측</span><strong>{formatDateTime(observedAt)}</strong></div>
        <div><span>앱 수신</span><strong>{formatDateTime(receivedAt)}</strong></div>
        {usage.freshness?.retryAt ? <div><span>다음 재시도</span><strong>{formatDateTime(usage.freshness.retryAt)}</strong></div> : null}
        {usage.freshness?.staleReason ? <p className="inline-note full-span">{usage.freshness.staleReason}</p> : null}
        <div className="service-row full-span">
          <div>
            <span>제공자 서비스</span>
            <strong className={`service-${service?.state ?? "unknown"}`}>
              {service?.label ?? serviceStatusLabel[service?.state ?? "unknown"]}
            </strong>
          </div>
          {service?.statusPageUrl ? (
            <button className="text-button" type="button" onClick={() => onOpenStatusPage(usage.provider)}>
              상태 페이지
              <ExternalLink size={13} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {service?.message ? <p className="inline-note full-span">{service.message}</p> : null}
      </div>
    </details>
  );
}

function Overview({
  snapshot,
  busy,
  notice,
  loadError,
  onRefresh,
  onRetry,
  onOpenProvider,
  onOpenSettings,
  registerFocusTarget,
  onQuit
}: {
  snapshot: UsageSnapshot | null;
  busy: boolean;
  notice: string;
  loadError: string;
  onRefresh: () => void;
  onRetry: () => void;
  onOpenProvider: (provider: ProviderId) => void;
  onOpenSettings: (focusKey: Extract<OverviewFocusKey, `settings-${string}`>) => void;
  registerFocusTarget: (key: OverviewFocusKey, element: HTMLButtonElement | null) => void;
  onQuit: () => void;
}) {
  const usage = snapshot?.usage ?? [];
  const lastUpdated = usage.map((item) => item.updatedAt).sort().at(-1);

  return (
    <>
      <header className="titlebar">
        <div>
          <p>AI quota tracker</p>
          <h1>Quota Bar</h1>
        </div>
        <div className="toolbar">
          <button className="icon-button" type="button" onClick={onRefresh} disabled={busy} aria-label="사용량 새로고침">
            <RefreshCw size={17} className={busy ? "spin" : ""} aria-hidden="true" />
          </button>
          <button
            ref={(element) => registerFocusTarget("settings-toolbar", element)}
            className="icon-button"
            type="button"
            aria-label="설정 열기"
            disabled={!snapshot}
            onClick={() => onOpenSettings("settings-toolbar")}
          >
            <Settings size={17} aria-hidden="true" />
          </button>
          <button className="icon-button subtle" type="button" onClick={onQuit} aria-label="Quota Bar 종료">
            <Power size={17} aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="screen-content overview-list" aria-label="AI 제공자 사용량">
        {!snapshot && loadError ? (
          <div className="empty-state" role="alert">
            <strong>사용량을 불러오지 못했습니다</strong>
            <p>{loadError}</p>
            <button className="secondary-button" type="button" disabled={busy} onClick={onRetry}>
              다시 시도
            </button>
          </div>
        ) : !snapshot ? (
          <div className="empty-state" role="status">
            <span className="loading-dot" aria-hidden="true" />
            <strong>사용량을 불러오는 중</strong>
            <p>연결된 AI 도구를 확인하고 있습니다.</p>
          </div>
        ) : usage.length ? usage.map((item) => (
          <ProviderCard
            key={item.provider}
            usage={item}
            buttonRef={(element) => registerFocusTarget(`provider:${item.provider}`, element)}
            onOpen={onOpenProvider}
          />
        )) : (
          <div className="empty-state">
            <strong>표시 중인 제공자가 없습니다</strong>
            <p>설정에서 확인할 AI 제공자를 선택하세요.</p>
            <button
              ref={(element) => registerFocusTarget("settings-empty", element)}
              className="secondary-button"
              type="button"
              onClick={() => onOpenSettings("settings-empty")}
            >
              설정 열기
            </button>
          </div>
        )}
      </section>

      {notice ? <p className="toast" role="status">{notice}</p> : null}
      <footer>
        <span>{refreshIntervalLabel(snapshot?.settings.refreshIntervalMs)}</span>
        <span>마지막 갱신 {formatTime(lastUpdated)}</span>
      </footer>
    </>
  );
}

function ProviderDetail({
  usage,
  history,
  historyLoading,
  historyRange,
  snapshot,
  busy,
  backButtonRef,
  onBack,
  onRefresh,
  onHistoryRangeChange,
  onNotificationChange,
  onTokenLogin,
  onOAuthLogin,
  onLogout,
  onOpenStatusPage
}: {
  usage: ProviderUsage;
  history?: ProviderHistory;
  historyLoading: boolean;
  historyRange: UsageHistoryRange;
  snapshot: UsageSnapshot;
  busy: boolean;
  backButtonRef: React.RefObject<HTMLButtonElement>;
  onBack: () => void;
  onRefresh: () => void;
  onHistoryRangeChange: (range: UsageHistoryRange) => void;
  onNotificationChange: (settings: ProviderNotificationSettings) => Promise<void>;
  onTokenLogin: (payload: TokenLoginPayload) => Promise<void>;
  onOAuthLogin: (provider: ProviderId) => Promise<void>;
  onLogout: (provider: ProviderId) => Promise<void>;
  onOpenStatusPage: (provider: ProviderId) => void;
}) {
  const windows = providerWindows(usage);
  const providerAlerts = snapshot.settings.notifications.providers[usage.provider];

  return (
    <>
      <header className="page-header">
        <button ref={backButtonRef} className="icon-button back-button" type="button" onClick={onBack} aria-label="개요로 돌아가기">
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div className="page-title">
          <h1>{usage.label}</h1>
          <StatusBadge usage={usage} />
        </div>
        <button className="icon-button" type="button" onClick={onRefresh} disabled={busy} aria-label={`${usage.label} 사용량 새로고침`}>
          <RefreshCw size={17} className={busy ? "spin" : ""} aria-hidden="true" />
        </button>
      </header>

      <div className="screen-content detail-content">
        {usage.message && (usage.status === "error" || usage.status === "signed-out" || usage.stale) ? (
          <p className={`state-message state-${usage.status}`}>{usage.message}</p>
        ) : null}

        <AuthActions
          usage={usage}
          hasSavedAuth={snapshot.settings.providers[usage.provider].hasSavedAuth}
          busy={busy}
          onTokenLogin={onTokenLogin}
          onOAuthLogin={onOAuthLogin}
          onLogout={onLogout}
        />

        <section className="detail-card" aria-labelledby="limits-heading">
          <div className="section-heading">
            <div>
              <span className="eyebrow">현재 사용량</span>
              <h2 id="limits-heading">기간별 한도</h2>
            </div>
            <small>{formatTime(usage.updatedAt)} 기준</small>
          </div>
          <div className="detail-windows">
            {windows.map((window) => <WindowMeter key={window.id} usage={usage} window={window} />)}
          </div>
        </section>

        <section className="detail-card" aria-labelledby="pace-heading">
          <div className="section-heading">
            <div>
              <span className="eyebrow">PACE</span>
              <h2 id="pace-heading">소진 예상</h2>
            </div>
            <UsageAnalysisHelp />
          </div>
          <PaceSummary usage={usage} />
        </section>

        <section className="detail-card" aria-labelledby="history-heading">
          <div className="section-heading">
            <div>
              <span className="eyebrow">HISTORY</span>
              <h2 id="history-heading">사용 이력</h2>
            </div>
            <div className="history-range" aria-label="사용 이력 기간">
              {(Object.keys(historyRangeLabels) as UsageHistoryRange[]).map((range) => (
                <button
                  key={range}
                  type="button"
                  className={historyRange === range ? "active" : ""}
                  aria-pressed={historyRange === range}
                  disabled={historyLoading}
                  onClick={() => onHistoryRangeChange(range)}
                >
                  {historyRangeLabels[range]}
                </button>
              ))}
            </div>
          </div>
          <HistoryChart usage={usage} history={history} loading={historyLoading} range={historyRange} />
        </section>

        <DataStatus usage={usage} onOpenStatusPage={onOpenStatusPage} />
        <ProviderAlertSettings
          usage={usage}
          settings={providerAlerts}
          globalEnabled={snapshot.settings.notifications.enabled}
          busy={busy}
          onChange={onNotificationChange}
        />
      </div>
    </>
  );
}

function SettingsView({
  snapshot,
  launchAtLogin,
  busy,
  notice,
  backButtonRef,
  onBack,
  onVisibilityChange,
  onMenuBarModeChange,
  onRefreshIntervalChange,
  onLaunchAtLoginChange,
  onNotificationsChange,
  onCopyDiagnostics
}: {
  snapshot: UsageSnapshot;
  launchAtLogin: boolean;
  busy: boolean;
  notice: string;
  backButtonRef: React.RefObject<HTMLButtonElement>;
  onBack: () => void;
  onVisibilityChange: (provider: ProviderId, visible: boolean) => void;
  onMenuBarModeChange: (mode: "icons" | "iconsWithPercent") => void;
  onRefreshIntervalChange: (milliseconds: number) => void;
  onLaunchAtLoginChange: (enabled: boolean) => void;
  onNotificationsChange: (settings: NotificationSettings) => Promise<void>;
  onCopyDiagnostics: () => void;
}) {
  const notifications = snapshot.settings.notifications;

  function updateQuietHours(patch: Partial<NotificationSettings["quietHours"]>) {
    void onNotificationsChange({
      ...notifications,
      quietHours: { ...notifications.quietHours, ...patch }
    });
  }

  return (
    <>
      <header className="page-header">
        <button ref={backButtonRef} className="icon-button back-button" type="button" onClick={onBack} aria-label="개요로 돌아가기">
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div className="page-title">
          <h1>설정</h1>
        </div>
        <span className="header-spacer" aria-hidden="true" />
      </header>

      <div className="screen-content settings-content">
        <section className="settings-section" aria-labelledby="provider-settings-heading">
          <div className="settings-heading">
            <span className="eyebrow">OVERVIEW</span>
            <h2 id="provider-settings-heading">표시할 제공자</h2>
          </div>
          {PROVIDERS.map((provider) => (
            <div className="setting-row" key={provider.id}>
              <div>
                <strong>{provider.label}</strong>
                <small>개요와 트레이에 표시</small>
              </div>
              <Toggle
                checked={snapshot.settings.providers[provider.id].visible}
                disabled={busy}
                label={`${provider.label} 표시`}
                onChange={(visible) => onVisibilityChange(provider.id, visible)}
              />
            </div>
          ))}
        </section>

        <section className="settings-section" aria-labelledby="display-settings-heading">
          <div className="settings-heading">
            <span className="eyebrow">DISPLAY</span>
            <h2 id="display-settings-heading">표시와 갱신</h2>
          </div>
          <div className="setting-block">
            <span className="setting-label">트레이 표시</span>
            <div className="segmented two" aria-label="트레이 표시 방식">
              <button
                type="button"
                className={snapshot.settings.menuBarDisplayMode === "icons" ? "active" : ""}
                aria-pressed={snapshot.settings.menuBarDisplayMode === "icons"}
                disabled={busy}
                onClick={() => onMenuBarModeChange("icons")}
              >
                아이콘
              </button>
              <button
                type="button"
                className={snapshot.settings.menuBarDisplayMode === "iconsWithPercent" ? "active" : ""}
                aria-pressed={snapshot.settings.menuBarDisplayMode === "iconsWithPercent"}
                disabled={busy}
                onClick={() => onMenuBarModeChange("iconsWithPercent")}
              >
                아이콘 + %
              </button>
            </div>
          </div>
          <div className="setting-block">
            <span className="setting-label">자동 갱신</span>
            <div className="segmented four" aria-label="자동 갱신 간격">
              {[10, 30, 60, 300].map((seconds) => {
                const value = seconds * 1_000;
                const active = snapshot.settings.refreshIntervalMs === value;
                return (
                  <button
                    key={seconds}
                    type="button"
                    className={active ? "active" : ""}
                    aria-pressed={active}
                    disabled={busy}
                    onClick={() => onRefreshIntervalChange(value)}
                  >
                    {seconds < 60 ? `${seconds}초` : `${seconds / 60}분`}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="setting-row borderless">
            <div>
              <strong>로그인할 때 자동 실행</strong>
              <small>컴퓨터를 켜면 Quota Bar 시작</small>
            </div>
            <Toggle
              checked={launchAtLogin}
              disabled={busy}
              label="로그인할 때 자동 실행"
              onChange={onLaunchAtLoginChange}
            />
          </div>
        </section>

        <section className="settings-section" aria-labelledby="notification-settings-heading">
          <div className="settings-heading heading-with-control">
            <div>
              <span className="eyebrow">NOTIFICATIONS</span>
              <h2 id="notification-settings-heading">전체 알림</h2>
            </div>
            <Toggle
              checked={notifications.enabled}
              disabled={busy}
              label="전체 알림"
              onChange={(enabled) => void onNotificationsChange({ ...notifications, enabled })}
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>알림 쿨다운</strong>
              <small>같은 알림의 반복을 제한</small>
            </div>
            <select
              value={notifications.cooldownMinutes}
              disabled={busy || !notifications.enabled}
              aria-label="알림 쿨다운"
              onChange={(event) => void onNotificationsChange({ ...notifications, cooldownMinutes: Number(event.target.value) })}
            >
              {cooldownOptions.includes(notifications.cooldownMinutes) ? null : (
                <option value={notifications.cooldownMinutes}>
                  {notifications.cooldownMinutes}분 (사용자 지정)
                </option>
              )}
              {cooldownOptions.map((minutes) => <option key={minutes} value={minutes}>{minutes}분</option>)}
            </select>
          </div>
          <div className="setting-row">
            <div>
              <strong>방해 금지 시간</strong>
              <small>해당 시간에는 알림을 보류</small>
            </div>
            <Toggle
              checked={notifications.quietHours.enabled}
              disabled={busy || !notifications.enabled}
              label="방해 금지 시간"
              onChange={(enabled) => updateQuietHours({ enabled })}
            />
          </div>
          {notifications.quietHours.enabled ? (
            <div className="time-range" aria-label="방해 금지 시간 범위">
              <label>
                시작
                <input
                  type="time"
                  value={notifications.quietHours.start}
                  disabled={busy || !notifications.enabled}
                  onChange={(event) => updateQuietHours({ start: event.target.value })}
                />
              </label>
              <span aria-hidden="true">→</span>
              <label>
                종료
                <input
                  type="time"
                  value={notifications.quietHours.end}
                  disabled={busy || !notifications.enabled}
                  onChange={(event) => updateQuietHours({ end: event.target.value })}
                />
              </label>
            </div>
          ) : null}
        </section>

        <section className="settings-section diagnostics-section" aria-labelledby="diagnostics-heading">
          <div className="settings-heading">
            <span className="eyebrow">SUPPORT</span>
            <h2 id="diagnostics-heading">진단 정보</h2>
          </div>
          <p>토큰과 개인정보를 제외한 연결 상태를 복사합니다.</p>
          <button className="secondary-button full-button" type="button" disabled={busy} onClick={onCopyDiagnostics}>
            <Clipboard size={15} aria-hidden="true" />
            진단 정보 복사
          </button>
        </section>
      </div>

      {notice ? <p className="toast" role="status">{notice}</p> : null}
    </>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [view, setView] = useState<View>({ kind: "overview" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [initialLoadError, setInitialLoadError] = useState("");
  const [launchAtLogin, setLaunchAtLoginState] = useState(false);
  const [history, setHistory] = useState<Partial<Record<ProviderId, ProviderHistory>>>({});
  const [historyLoading, setHistoryLoading] = useState<ProviderId | null>(null);
  const [historyRange, setHistoryRange] = useState<UsageHistoryRange>("24h");
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusKeyRef = useRef<OverviewFocusKey | null>(null);
  const overviewFocusRefs = useRef<Partial<Record<OverviewFocusKey, HTMLButtonElement | null>>>({});
  const viewedUsage = view.kind === "provider"
    ? snapshot?.usage.find((item) => item.provider === view.provider)
    : undefined;
  const historyRevision = viewedUsage
    ? [
        viewedUsage.dataUpdatedAt ?? viewedUsage.freshness?.observedAt ?? "",
        ...providerWindows(viewedUsage).map((window) =>
          `${window.id}:${window.dataUpdatedAt ?? ""}:${window.percent}:${window.resetsAt ?? ""}`
        )
      ].join("|")
    : "";

  useEffect(() => {
    let active = true;
    const acceptSnapshot = (nextSnapshot: UsageSnapshot) => {
      if (!active) {
        return;
      }
      setInitialLoadError("");
      setSnapshot(nextSnapshot);
    };
    void window.aiUsage.getUsage()
      .then(acceptSnapshot)
      .catch((error) => {
        if (active) {
          setInitialLoadError(error instanceof Error && error.message
            ? error.message
            : "사용량을 불러오지 못했습니다. 다시 시도해 주세요.");
        }
      });
    const unsubscribe = window.aiUsage.onUsageSnapshot(acceptSnapshot);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    void window.aiUsage.getLaunchAtLogin()
      .then(setLaunchAtLoginState)
      .catch(() => setNotice("자동 실행 상태를 확인하지 못했습니다."));
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (view.kind === "overview") {
        const focusKey = returnFocusKeyRef.current;
        if (focusKey) {
          const target = overviewFocusRefs.current[focusKey] ?? overviewFocusRefs.current["settings-toolbar"];
          target?.focus();
          returnFocusKeyRef.current = null;
        }
        return;
      }
      backButtonRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view]);

  useEffect(() => {
    if (view.kind !== "provider") {
      return;
    }

    let active = true;
    setHistoryLoading(view.provider);
    void window.aiUsage.getHistory(view.provider, historyRange)
      .then((result) => {
        if (active) {
          setHistory((current) => ({ ...current, [view.provider]: result }));
        }
      })
      .catch(() => {
        if (active) {
          setNotice("사용 기록을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (active) {
          setHistoryLoading(null);
        }
      });

    return () => {
      active = false;
    };
  }, [view, historyRevision, historyRange]);

  useEffect(() => {
    if (view.kind === "overview") {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (document.querySelector("dialog:modal")) {
          return;
        }
        event.preventDefault();
        goBack();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(""), 4_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function runSnapshot(action: () => Promise<UsageSnapshot>): Promise<boolean> {
    setBusy(true);
    try {
      setSnapshot(await action());
      setInitialLoadError("");
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "요청을 완료하지 못했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function retryInitialLoad() {
    setBusy(true);
    setInitialLoadError("");
    try {
      setSnapshot(await window.aiUsage.getUsage());
    } catch (error) {
      setInitialLoadError(error instanceof Error && error.message
        ? error.message
        : "사용량을 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  function registerFocusTarget(key: OverviewFocusKey, element: HTMLButtonElement | null) {
    overviewFocusRefs.current[key] = element;
  }

  function openProvider(provider: ProviderId) {
    returnFocusKeyRef.current = `provider:${provider}`;
    setNotice("");
    setHistoryRange("24h");
    setView({ kind: "provider", provider });
  }

  function openSettings(focusKey: Extract<OverviewFocusKey, `settings-${string}`>) {
    returnFocusKeyRef.current = focusKey;
    setNotice("");
    setView({ kind: "settings" });
  }

  function goBack() {
    setView({ kind: "overview" });
  }

  async function setVisibility(provider: ProviderId, visible: boolean) {
    await runSnapshot(() => window.aiUsage.setProviderVisibility(provider, visible));
  }

  async function tokenLogin(payload: TokenLoginPayload) {
    if (await runSnapshot(() => window.aiUsage.tokenLogin(payload))) {
      const providerLabel = PROVIDERS.find((provider) => provider.id === payload.provider)?.label ?? payload.provider;
      setNotice(`${providerLabel} 연결 정보가 저장되었습니다.`);
    }
  }

  async function oauthLogin(provider: ProviderId) {
    setBusy(true);
    try {
      const result = await window.aiUsage.oauthLogin(provider);
      setSnapshot(result.snapshot);
      setNotice(result.result.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "로그인을 완료하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function logout(provider: ProviderId) {
    if (await runSnapshot(() => window.aiUsage.logout(provider))) {
      setNotice("저장된 연결 정보를 삭제했습니다.");
    }
  }

  async function toggleLaunchAtLogin(enabled: boolean) {
    setBusy(true);
    try {
      setLaunchAtLoginState(await window.aiUsage.setLaunchAtLogin(enabled));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "자동 실행 설정을 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function setNotifications(settings: NotificationSettings) {
    await runSnapshot(() => window.aiUsage.setNotificationSettings(settings));
  }

  async function setProviderNotifications(provider: ProviderId, settings: ProviderNotificationSettings) {
    if (!snapshot) {
      return;
    }
    await setNotifications({
      ...snapshot.settings.notifications,
      providers: {
        ...snapshot.settings.notifications.providers,
        [provider]: settings
      }
    });
  }

  async function copyDiagnostics() {
    setBusy(true);
    try {
      const copied = await window.aiUsage.copyDiagnostics();
      setNotice(copied ? "진단 정보를 클립보드에 복사했습니다." : "진단 정보를 복사하지 못했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "진단 정보를 복사하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function openStatusPage(provider: ProviderId) {
    void window.aiUsage.openStatusPage(provider).catch(() => setNotice("상태 페이지를 열지 못했습니다."));
  }

  if (view.kind === "provider" && snapshot) {
    const usage = snapshot.usage.find((item) => item.provider === view.provider);
    if (usage) {
      return (
        <main className="shell">
          <ProviderDetail
            usage={usage}
            history={history[usage.provider]?.range === historyRange ? history[usage.provider] : undefined}
            historyLoading={historyLoading === usage.provider}
            historyRange={historyRange}
            snapshot={snapshot}
            busy={busy}
            backButtonRef={backButtonRef}
            onBack={goBack}
            onRefresh={() => void runSnapshot(window.aiUsage.refreshUsage)}
            onHistoryRangeChange={setHistoryRange}
            onNotificationChange={(settings) => setProviderNotifications(usage.provider, settings)}
            onTokenLogin={tokenLogin}
            onOAuthLogin={oauthLogin}
            onLogout={logout}
            onOpenStatusPage={openStatusPage}
          />
          {notice ? <p className="toast" role="status">{notice}</p> : null}
        </main>
      );
    }
  }

  if (view.kind === "settings" && snapshot) {
    return (
      <main className="shell">
        <SettingsView
          snapshot={snapshot}
          launchAtLogin={launchAtLogin}
          busy={busy}
          notice={notice}
          backButtonRef={backButtonRef}
          onBack={goBack}
          onVisibilityChange={(provider, visible) => void setVisibility(provider, visible)}
          onMenuBarModeChange={(mode) => void runSnapshot(() => window.aiUsage.setMenuBarDisplayMode(mode))}
          onRefreshIntervalChange={(milliseconds) => void runSnapshot(() => window.aiUsage.setRefreshIntervalMs(milliseconds))}
          onLaunchAtLoginChange={(enabled) => void toggleLaunchAtLogin(enabled)}
          onNotificationsChange={setNotifications}
          onCopyDiagnostics={() => void copyDiagnostics()}
        />
      </main>
    );
  }

  return (
    <main className="shell">
      <Overview
        snapshot={snapshot}
        busy={busy}
        notice={notice}
        loadError={initialLoadError}
        onRefresh={() => void runSnapshot(window.aiUsage.refreshUsage)}
        onRetry={() => void retryInitialLoad()}
        onOpenProvider={openProvider}
        onOpenSettings={openSettings}
        registerFocusTarget={registerFocusTarget}
        onQuit={window.aiUsage.quit}
      />
    </main>
  );
}
