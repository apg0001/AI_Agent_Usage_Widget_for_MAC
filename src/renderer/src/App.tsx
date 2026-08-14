import {
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  Clipboard,
  ExternalLink,
  KeyRound,
  LogOut,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Settings,
  Trash2,
  X
} from "lucide-react";
import { createContext, FormEvent, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_METER_COLOR_BANDS,
  LanguageSetting,
  MeterColorBand,
  NotificationSettings,
  ProviderHistory,
  ProviderId,
  ProviderNotificationSettings,
  ProviderUsage,
  PROVIDERS,
  ThemeSetting,
  TokenLoginPayload,
  UpdateStatus,
  UsageHistoryRange,
  UsageLimitWindow,
  UsageSnapshot
} from "../../shared/types";
import { getTranslations, Translations } from "../../shared/i18n";
import { buildHistoryAxisTicks, normalizeHistoryPoints } from "./historyAxis";
import "./styles.css";

type View =
  | { kind: "overview" }
  | { kind: "provider"; provider: ProviderId }
  | { kind: "settings" };

type OverviewFocusKey = `provider:${ProviderId}` | "settings-toolbar" | "settings-empty";

const cooldownOptions = [5, 15, 30, 60];
const MAX_METER_COLOR_BANDS = 8;

const I18nContext = createContext<{ t: Translations; lang: LanguageSetting; bands: MeterColorBand[] }>({
  t: getTranslations("ko"),
  lang: "ko",
  bands: DEFAULT_METER_COLOR_BANDS
});

function useI18n() {
  return useContext(I18nContext);
}

function colorForPercent(percent: number, bands: MeterColorBand[]): string {
  const sorted = [...bands].sort((a, b) => a.upTo - b.upTo);
  const match = sorted.find((band) => percent <= band.upTo);
  return (match ?? sorted[sorted.length - 1] ?? DEFAULT_METER_COLOR_BANDS[DEFAULT_METER_COLOR_BANDS.length - 1]).color;
}

function addColorBand(bands: MeterColorBand[]): MeterColorBand[] {
  if (bands.length >= MAX_METER_COLOR_BANDS) {
    return bands;
  }
  const sorted = [...bands].sort((a, b) => a.upTo - b.upTo);
  let previousUpTo = 0;
  let gapIndex = 0;
  let gapSize = -1;
  sorted.forEach((band, index) => {
    const gap = band.upTo - previousUpTo;
    if (gap > gapSize) {
      gapSize = gap;
      gapIndex = index;
    }
    previousUpTo = band.upTo;
  });
  const lowerBound = gapIndex === 0 ? 0 : sorted[gapIndex - 1].upTo;
  const upperBound = sorted[gapIndex].upTo;
  const midpoint = Math.min(Math.max(Math.round((lowerBound + upperBound) / 2), lowerBound + 1), upperBound);
  const palette = ["#8b5cf6", "#14b8a6", "#ec4899", "#84cc16", "#0ea5e9"];
  const newBand: MeterColorBand = {
    id: `band-${Date.now()}`,
    upTo: midpoint,
    color: palette[bands.length % palette.length]
  };
  const next = [...sorted, newBand].sort((a, b) => a.upTo - b.upTo);
  next[next.length - 1] = { ...next[next.length - 1], upTo: 100 };
  return next;
}

function formatTime(value: string | undefined, locale: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function formatDateTime(value: string | undefined, locale: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function providerWindows(usage: ProviderUsage, t: Translations): UsageLimitWindow[] {
  if (usage.windows?.length) {
    return usage.windows;
  }

  return [
    {
      id: "total",
      label: t.provider.fallbackWindowLabel,
      percent: usage.percent,
      resetsAt: usage.resetsAt,
      resetRemaining: usage.resetRemaining,
      available: usage.status !== "signed-out" && usage.status !== "error"
    }
  ];
}

function updateStatusText(t: Translations, status: UpdateStatus): string {
  switch (status.state) {
    case "checking":
      return t.updates.statusChecking;
    case "available":
      return t.updates.statusAvailable(status.version ?? "");
    case "downloading":
      return t.updates.statusDownloading(status.progressPercent ?? 0);
    case "downloaded":
      return t.updates.statusDownloaded(status.version ?? "");
    case "not-available":
      return status.message ?? t.updates.statusNotAvailable;
    case "error":
      switch (status.errorCode) {
        case "metadata-missing":
          return t.updates.errorMetadataMissing;
        case "network":
          return t.updates.errorNetwork;
        case "access-denied":
          return t.updates.errorAccessDenied;
        case "invalid-release":
          return t.updates.errorInvalidRelease;
        default:
          return t.updates.errorUnknown;
      }
    default:
      return "";
  }
}

function windowIsAvailable(window: UsageLimitWindow) {
  return window.available !== false && window.quality !== "unavailable";
}

function meterColor(percent: number, status: ProviderUsage["status"] | undefined, bands: MeterColorBand[]) {
  if (status === "signed-out" || status === "error") {
    return "var(--status-muted)";
  }
  return colorForPercent(percent, bands);
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
  const { t } = useI18n();
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
        aria-label={t.analysisHelp.triggerAria}
        aria-haspopup="dialog"
        aria-controls="usage-analysis-help"
        title={t.analysisHelp.triggerTitle}
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
              <h2 id="analysis-help-title">{t.analysisHelp.title}</h2>
            </div>
            <button
              ref={closeButtonRef}
              className="analysis-dialog-close"
              type="button"
              aria-label={t.analysisHelp.closeAria}
              onClick={closeHelp}
            >
              <X size={17} aria-hidden="true" />
            </button>
          </header>
          <div
            className="analysis-dialog-body"
            role="region"
            aria-label={t.analysisHelp.bodyAria}
            tabIndex={0}
          >
            <p id="analysis-help-intro">
              {t.analysisHelp.intro}
            </p>
            <ol className="analysis-steps">
              {t.analysisHelp.steps.map((step, index) => (
                <li key={step.title}>
                  <span aria-hidden="true">{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="analysis-caveat">
              {t.analysisHelp.caveat}
            </p>
          </div>
        </div>
      </dialog>
    </>
  );
}

function WindowMeter({ usage, window, compact = false }: { usage: ProviderUsage; window: UsageLimitWindow; compact?: boolean }) {
  const { t, bands } = useI18n();
  const available = windowIsAvailable(window);
  const percent = available ? Math.min(100, Math.max(0, Math.round(window.percent))) : 0;
  const description = window.message ?? (window.resetRemaining ? t.format.resetUntil(window.resetRemaining) : t.format.noResetTime);
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
        aria-label={t.provider.windowUsageAria(usage.label, window.label)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={available ? percent : undefined}
        aria-valuetext={available
          ? t.provider.windowUsageValueText(percent, roundedElapsedPercent)
          : t.provider.windowUnavailable}
      >
        <span className="meter-fill" style={{ width: `${percent}%`, background: meterColor(percent, usage.status, bands) }} />
        {markerPosition === undefined ? null : (
          <span className="period-marker" style={{ left: `${markerPosition}%` }} aria-hidden="true" />
        )}
      </div>
      <div className="meter-meta">
        <small title={description}>{description}</small>
        {roundedElapsedPercent === undefined ? null : (
          <small className="period-legend">
            <span aria-hidden="true" />
            {t.provider.periodElapsed(roundedElapsedPercent)}
          </small>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ usage }: { usage: ProviderUsage }) {
  const { t } = useI18n();
  return (
    <span
      className={`status-badge status-${usage.status}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="sr-only">{t.provider.statusAriaPrefix(usage.label)}</span>
      {t.status[usage.status]}
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
  const { t } = useI18n();
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
        placeholder={t.auth.tokenPlaceholder}
        aria-label={t.auth.tokenAria(provider)}
        autoComplete="off"
        onChange={(event) => setToken(event.target.value)}
      />
      <button className="primary-button" type="submit" disabled={busy || !token.trim()}>
        <KeyRound size={14} aria-hidden="true" />
        {t.auth.connect}
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
  const { t } = useI18n();
  const inferredConnection = hasSavedAuth || ["local", "api", "token"].includes(usage.source ?? "");
  const connected = usage.connectionStatus ? usage.connectionStatus === "connected" : inferredConnection;

  if (connected && !hasSavedAuth && !usage.accountLabel) {
    return null;
  }

  return (
    <section className="detail-card auth-card" aria-labelledby="auth-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t.auth.connectionEyebrow}</span>
          <h2 id="auth-heading">{connected ? t.auth.savedAccount : t.auth.loginRequired}</h2>
        </div>
        {hasSavedAuth ? (
          <button className="danger-button" type="button" disabled={busy} onClick={() => onLogout(usage.provider)}>
            <LogOut size={14} aria-hidden="true" />
            {t.auth.logout}
          </button>
        ) : null}
      </div>
      {connected && usage.accountLabel ? <p className="supporting-text account-label">{usage.accountLabel}</p> : null}
      {!connected ? <p className="supporting-text">{t.loginHelp[usage.provider]}</p> : null}
      {!connected && usage.provider === "codex" ? (
        <TokenLoginForm provider={usage.provider} busy={busy} onTokenLogin={onTokenLogin} />
      ) : null}
      {!connected && usage.provider === "gemini" ? (
        <button className="primary-button full-button" type="button" disabled={busy} onClick={() => onOAuthLogin(usage.provider)}>
          <KeyRound size={14} aria-hidden="true" />
          {t.auth.googleOAuth}
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
  const { t, bands } = useI18n();
  const windows = providerWindows(usage, t).slice(0, 2);
  const shortMessage = usage.status === "signed-out" || usage.status === "error" || usage.stale ? usage.message : undefined;
  const stripeStyle = { "--stripe-color": meterColor(usage.percent, usage.status, bands) } as React.CSSProperties;

  return (
    <article className={`provider-card provider-${usage.status}`} style={stripeStyle}>
      <div className="provider-card-heading">
        <div className="provider-title">
          <h2>{usage.label}</h2>
          <StatusBadge usage={usage} />
        </div>
        <button
          ref={buttonRef}
          className="detail-button"
          type="button"
          aria-label={t.provider.detailAria(usage.label)}
          onClick={() => onOpen(usage.provider)}
        >
          {t.provider.detail}
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
  const { t } = useI18n();
  const primaryWindowId = providerWindows(usage, t)[0]?.id;
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
          <strong>{loading ? t.history.loadingTitle : t.history.learningTitle}</strong>
          <p>{loading ? t.history.loadingBody : t.history.learningBody}</p>
        </div>
      </div>
    );
  }

  const firstTick = geometry.ticks[0];
  const lastTick = geometry.ticks.at(-1);
  const observedRangeLabel = firstTick && lastTick
    ? t.history.observedRange(firstTick.fullLabel, lastTick.fullLabel)
    : "";

  return (
    <div className="history-chart">
      <svg
        viewBox="0 0 320 70"
        role="img"
        aria-label={t.history.chartAria(usage.label, t.historyRange[range], observedRangeLabel, Math.round(geometry.min), Math.round(geometry.max))}
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
      <p className="history-summary">{t.history.summary(Math.round(geometry.min), Math.round(geometry.max), points.length)}</p>
    </div>
  );
}

function PaceSummary({ usage }: { usage: ProviderUsage }) {
  const { t } = useI18n();
  const windows = providerWindows(usage, t);
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
          <strong>{t.pace.learningTitle}</strong>
          <p>{pace?.sampleCount ? t.pace.learningBodyWithSamples(pace.sampleCount) : t.pace.learningBodyNoSamples}</p>
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
            ? t.pace.exhaustedAt(formatDateTime(pace.estimatedExhaustedAt, t.format.dateLocale))
            : projected === undefined
              ? t.pace.calculating
              : t.pace.projectedAtReset(projected)}
        </strong>
        <p>{rate === undefined ? t.pace.sampleBased(pace.sampleCount) : t.pace.rateAndSampleBased(rate.toFixed(1), pace.sampleCount)}</p>
      </div>
    </div>
  );
}

function Disclosure({
  summary,
  status,
  children
}: {
  summary: React.ReactNode;
  status: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`disclosure-card${open ? " open" : ""}`}>
      <button
        type="button"
        className="disclosure-summary"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{summary}</span>
        <small>{status}</small>
      </button>
      {open ? children : null}
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
  const { t } = useI18n();

  function toggleThreshold(threshold: number, enabled: boolean) {
    const thresholds = enabled
      ? Array.from(new Set([...settings.thresholds, threshold])).sort((a, b) => a - b)
      : settings.thresholds.filter((value) => value !== threshold);
    void onChange({ ...settings, thresholds });
  }

  return (
    <Disclosure
      summary={
        <>
          <Bell size={15} aria-hidden="true" />
          {t.alerts.heading}
        </>
      }
      status={settings.enabled && globalEnabled ? t.alerts.on : t.alerts.off}
    >
      <div className="disclosure-content">
        {!globalEnabled ? <p className="inline-note">{t.alerts.globalDisabledNote}</p> : null}
        <div className="setting-row compact-setting-row">
          <div>
            <strong>{t.alerts.providerToggleLabel(usage.label)}</strong>
            <small>{t.alerts.providerToggleHint}</small>
          </div>
          <Toggle
            checked={settings.enabled}
            disabled={busy || !globalEnabled}
            label={t.alerts.providerToggleLabel(usage.label)}
            onChange={(enabled) => void onChange({ ...settings, enabled })}
          />
        </div>
        <fieldset className="threshold-fieldset" disabled={busy || !globalEnabled || !settings.enabled}>
          <legend>{t.alerts.thresholdLegend}</legend>
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
          {t.alerts.resetNotify}
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={settings.projectedExhaustionEnabled}
            disabled={busy || !globalEnabled || !settings.enabled}
            onChange={(event) => void onChange({ ...settings, projectedExhaustionEnabled: event.target.checked })}
          />
          {t.alerts.projectedNotify}
        </label>
      </div>
    </Disclosure>
  );
}

function DataStatus({ usage, onOpenStatusPage }: { usage: ProviderUsage; onOpenStatusPage: (provider: ProviderId) => void }) {
  const { t } = useI18n();
  const sourceLabel = usage.sourceInfo?.label ?? (usage.source ? t.sourceFallback[usage.source] : t.dataStatus.unknownSource);
  const sourceMode = usage.sourceInfo?.mode ? t.sourceMode[usage.sourceInfo.mode] : undefined;
  const observedAt = usage.freshness?.observedAt ?? usage.dataUpdatedAt;
  const receivedAt = usage.freshness?.receivedAt ?? usage.updatedAt;
  const service = usage.serviceStatus;

  return (
    <Disclosure summary={t.dataStatus.heading} status={usage.stale ? t.dataStatus.cached : sourceLabel}>
      <div className="disclosure-content data-grid">
        <div><span>{t.dataStatus.source}</span><strong>{sourceLabel}{sourceMode ? ` · ${sourceMode}` : ""}</strong></div>
        <div><span>{t.dataStatus.observed}</span><strong>{formatDateTime(observedAt, t.format.dateLocale)}</strong></div>
        <div><span>{t.dataStatus.received}</span><strong>{formatDateTime(receivedAt, t.format.dateLocale)}</strong></div>
        {usage.freshness?.retryAt ? <div><span>{t.dataStatus.nextRetry}</span><strong>{formatDateTime(usage.freshness.retryAt, t.format.dateLocale)}</strong></div> : null}
        {usage.freshness?.staleReason ? <p className="inline-note full-span">{usage.freshness.staleReason}</p> : null}
        <div className="service-row full-span">
          <div>
            <span>{t.dataStatus.providerService}</span>
            <strong className={`service-${service?.state ?? "unknown"}`}>
              {service?.label ?? t.serviceStatus[service?.state ?? "unknown"]}
            </strong>
          </div>
          {service?.statusPageUrl ? (
            <button className="text-button" type="button" onClick={() => onOpenStatusPage(usage.provider)}>
              {t.dataStatus.statusPage}
              <ExternalLink size={13} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {service?.message ? <p className="inline-note full-span">{service.message}</p> : null}
      </div>
    </Disclosure>
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
  onQuit,
  onClose
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
  onClose: () => void;
}) {
  const { t } = useI18n();
  const usage = snapshot?.usage ?? [];
  const lastUpdated = usage.map((item) => item.updatedAt).sort().at(-1);

  return (
    <>
      <header className="titlebar">
        <div>
          <p>{t.common.tagline}</p>
          <h1>{t.common.appName}</h1>
        </div>
        <div className="toolbar">
          <button className="icon-button" type="button" onClick={onRefresh} disabled={busy} aria-label={t.overview.refreshAria}>
            <RefreshCw size={17} className={busy ? "spin" : ""} aria-hidden="true" />
          </button>
          <button
            ref={(element) => registerFocusTarget("settings-toolbar", element)}
            className="icon-button"
            type="button"
            aria-label={t.overview.settingsAria}
            disabled={!snapshot}
            onClick={() => onOpenSettings("settings-toolbar")}
          >
            <Settings size={17} aria-hidden="true" />
          </button>
          <button className="icon-button subtle" type="button" onClick={onQuit} aria-label={t.overview.quitAria}>
            <Power size={17} aria-hidden="true" />
          </button>
          {window.aiUsage.platform === "linux" ? (
            <button className="icon-button subtle" type="button" onClick={onClose} aria-label={t.overview.closeAria}>
              <X size={17} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>

      <section className="screen-content overview-list" aria-label={t.overview.usageListAria}>
        {!snapshot && loadError ? (
          <div className="empty-state" role="alert">
            <strong>{t.overview.loadErrorTitle}</strong>
            <p>{loadError}</p>
            <button className="secondary-button" type="button" disabled={busy} onClick={onRetry}>
              {t.overview.retry}
            </button>
          </div>
        ) : !snapshot ? (
          <div className="empty-state" role="status">
            <span className="loading-dot" aria-hidden="true" />
            <strong>{t.overview.loadingTitle}</strong>
            <p>{t.overview.loadingBody}</p>
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
            <strong>{t.overview.emptyTitle}</strong>
            <p>{t.overview.emptyBody}</p>
            <button
              ref={(element) => registerFocusTarget("settings-empty", element)}
              className="secondary-button"
              type="button"
              onClick={() => onOpenSettings("settings-empty")}
            >
              {t.overview.openSettings}
            </button>
          </div>
        )}
      </section>

      {notice ? <p className="toast" role="status">{notice}</p> : null}
      <footer>
        <span>{t.format.refreshIntervalLabel(snapshot?.settings.refreshIntervalMs)}</span>
        <span>{t.format.lastUpdated(formatTime(lastUpdated, t.format.dateLocale))}</span>
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
  const { t } = useI18n();
  const windows = providerWindows(usage, t);
  const providerAlerts = snapshot.settings.notifications.providers[usage.provider];

  return (
    <>
      <header className="page-header">
        <button ref={backButtonRef} className="icon-button back-button" type="button" onClick={onBack} aria-label={t.detail.backAria}>
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div className="page-title">
          <h1>{usage.label}</h1>
          <StatusBadge usage={usage} />
        </div>
        <button className="icon-button" type="button" onClick={onRefresh} disabled={busy} aria-label={t.detail.refreshAria(usage.label)}>
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
              <span className="eyebrow">{t.detail.currentUsageEyebrow}</span>
              <h2 id="limits-heading">{t.detail.limitsHeading}</h2>
            </div>
            <small>{t.detail.asOf(formatTime(usage.updatedAt, t.format.dateLocale))}</small>
          </div>
          <div className="detail-windows">
            {windows.map((window) => <WindowMeter key={window.id} usage={usage} window={window} />)}
          </div>
        </section>

        <section className="detail-card" aria-labelledby="pace-heading">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t.detail.paceEyebrow}</span>
              <h2 id="pace-heading">{t.detail.paceHeading}</h2>
            </div>
            <UsageAnalysisHelp />
          </div>
          <PaceSummary usage={usage} />
        </section>

        <section className="detail-card" aria-labelledby="history-heading">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t.detail.historyEyebrow}</span>
              <h2 id="history-heading">{t.detail.historyHeading}</h2>
            </div>
            <div className="history-range" aria-label={t.history.rangeAria}>
              {(Object.keys(t.historyRange) as UsageHistoryRange[]).map((range) => (
                <button
                  key={range}
                  type="button"
                  className={historyRange === range ? "active" : ""}
                  aria-pressed={historyRange === range}
                  disabled={historyLoading}
                  onClick={() => onHistoryRangeChange(range)}
                >
                  {t.historyRange[range]}
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
  appVersion,
  updateStatus,
  busy,
  notice,
  backButtonRef,
  onBack,
  onVisibilityChange,
  onMenuBarModeChange,
  onRefreshIntervalChange,
  onLaunchAtLoginChange,
  onThemeChange,
  onLanguageChange,
  onMeterColorBandsChange,
  onNotificationsChange,
  onCopyDiagnostics,
  onCheckForUpdates,
  onInstallUpdate,
  onCopyUpdateCommand,
  onRestartApp
}: {
  snapshot: UsageSnapshot;
  launchAtLogin: boolean;
  appVersion: string;
  updateStatus: UpdateStatus;
  busy: boolean;
  notice: string;
  backButtonRef: React.RefObject<HTMLButtonElement>;
  onBack: () => void;
  onVisibilityChange: (provider: ProviderId, visible: boolean) => void;
  onMenuBarModeChange: (mode: "icons" | "iconsWithPercent") => void;
  onRefreshIntervalChange: (milliseconds: number) => void;
  onLaunchAtLoginChange: (enabled: boolean) => void;
  onThemeChange: (theme: ThemeSetting) => void;
  onLanguageChange: (language: LanguageSetting) => void;
  onMeterColorBandsChange: (bands: MeterColorBand[]) => void;
  onNotificationsChange: (settings: NotificationSettings) => Promise<void>;
  onCopyDiagnostics: () => void;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onCopyUpdateCommand: (command: string) => void;
  onRestartApp: () => void;
}) {
  const { t, bands } = useI18n();
  const sortedBands = [...bands].sort((a, b) => a.upTo - b.upTo);

  function updateBandColor(id: string, color: string) {
    onMeterColorBandsChange(bands.map((band) => (band.id === id ? { ...band, color } : band)));
  }

  function updateBandUpTo(id: string, upTo: number) {
    onMeterColorBandsChange(bands.map((band) => (band.id === id ? { ...band, upTo } : band)));
  }

  function removeBand(id: string) {
    if (bands.length <= 1) {
      return;
    }
    onMeterColorBandsChange(bands.filter((band) => band.id !== id));
  }

  function addBandRow() {
    onMeterColorBandsChange(addColorBand(bands));
  }

  function resetBands() {
    onMeterColorBandsChange(DEFAULT_METER_COLOR_BANDS.map((band) => ({ ...band })));
  }

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
        <button ref={backButtonRef} className="icon-button back-button" type="button" onClick={onBack} aria-label={t.settings.backAria}>
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div className="page-title">
          <h1>{t.settings.title}</h1>
        </div>
        <span className="header-spacer" aria-hidden="true" />
      </header>

      <div className="screen-content settings-content">
        <section className="settings-section" aria-labelledby="provider-settings-heading">
          <div className="settings-heading">
            <span className="eyebrow">{t.settings.providersEyebrow}</span>
            <h2 id="provider-settings-heading">{t.settings.providersHeading}</h2>
          </div>
          {PROVIDERS.map((provider) => (
            <div className="setting-row" key={provider.id}>
              <div>
                <strong>{provider.label}</strong>
                <small>{t.settings.providerVisibleHint}</small>
              </div>
              <Toggle
                checked={snapshot.settings.providers[provider.id].visible}
                disabled={busy}
                label={t.settings.providerVisibleAria(provider.label)}
                onChange={(visible) => onVisibilityChange(provider.id, visible)}
              />
            </div>
          ))}
        </section>

        <section className="settings-section" aria-labelledby="display-settings-heading">
          <div className="settings-heading">
            <span className="eyebrow">{t.settings.displayEyebrow}</span>
            <h2 id="display-settings-heading">{t.settings.displayHeading}</h2>
          </div>
          <div className="setting-block">
            <span className="setting-label">{t.settings.trayDisplayLabel}</span>
            <div className="segmented two" aria-label={t.settings.trayDisplayAria}>
              <button
                type="button"
                className={snapshot.settings.menuBarDisplayMode === "icons" ? "active" : ""}
                aria-pressed={snapshot.settings.menuBarDisplayMode === "icons"}
                disabled={busy}
                onClick={() => onMenuBarModeChange("icons")}
              >
                {t.settings.trayIcons}
              </button>
              <button
                type="button"
                className={snapshot.settings.menuBarDisplayMode === "iconsWithPercent" ? "active" : ""}
                aria-pressed={snapshot.settings.menuBarDisplayMode === "iconsWithPercent"}
                disabled={busy}
                onClick={() => onMenuBarModeChange("iconsWithPercent")}
              >
                {t.settings.trayIconsPercent}
              </button>
            </div>
          </div>
          <div className="setting-block">
            <span className="setting-label">{t.settings.refreshLabel}</span>
            <div className="segmented four" aria-label={t.settings.refreshAria}>
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
                    {t.format.durationShort(seconds)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="setting-row borderless">
            <div>
              <strong>{t.settings.launchAtLoginTitle}</strong>
              <small>{t.settings.launchAtLoginHint}</small>
            </div>
            <Toggle
              checked={launchAtLogin}
              disabled={busy}
              label={t.settings.launchAtLoginTitle}
              onChange={onLaunchAtLoginChange}
            />
          </div>
        </section>

        <section className="settings-section" aria-labelledby="appearance-settings-heading">
          <div className="settings-heading">
            <span className="eyebrow">{t.settings.appearanceEyebrow}</span>
            <h2 id="appearance-settings-heading">{t.settings.appearanceHeading}</h2>
          </div>
          <div className="setting-block">
            <span className="setting-label">{t.settings.themeLabel}</span>
            <div className="segmented three" aria-label={t.settings.themeAria}>
              <button
                type="button"
                className={snapshot.settings.theme === "light" ? "active" : ""}
                aria-pressed={snapshot.settings.theme === "light"}
                disabled={busy}
                onClick={() => onThemeChange("light")}
              >
                {t.settings.themeLight}
              </button>
              <button
                type="button"
                className={snapshot.settings.theme === "dark" ? "active" : ""}
                aria-pressed={snapshot.settings.theme === "dark"}
                disabled={busy}
                onClick={() => onThemeChange("dark")}
              >
                {t.settings.themeDark}
              </button>
              <button
                type="button"
                className={snapshot.settings.theme === "system" ? "active" : ""}
                aria-pressed={snapshot.settings.theme === "system"}
                disabled={busy}
                onClick={() => onThemeChange("system")}
              >
                {t.settings.themeSystem}
              </button>
            </div>
          </div>
          <div className="setting-block">
            <span className="setting-label">{t.settings.languageLabel}</span>
            <div className="segmented two" aria-label={t.settings.languageAria}>
              <button
                type="button"
                className={snapshot.settings.language === "ko" ? "active" : ""}
                aria-pressed={snapshot.settings.language === "ko"}
                disabled={busy}
                onClick={() => onLanguageChange("ko")}
              >
                {t.settings.languageKorean}
              </button>
              <button
                type="button"
                className={snapshot.settings.language === "en" ? "active" : ""}
                aria-pressed={snapshot.settings.language === "en"}
                disabled={busy}
                onClick={() => onLanguageChange("en")}
              >
                {t.settings.languageEnglish}
              </button>
            </div>
          </div>
        </section>

        <section className="settings-section" aria-labelledby="colors-settings-heading">
          <div className="settings-heading">
            <span className="eyebrow">{t.colors.eyebrow}</span>
            <h2 id="colors-settings-heading">{t.colors.heading}</h2>
          </div>
          <p className="supporting-text">{t.colors.hint}</p>
          <div className="color-band-list">
            {sortedBands.map((band, index) => {
              const isLast = index === sortedBands.length - 1;
              return (
                <div className="color-band-row" key={band.id}>
                  <input
                    type="color"
                    className="color-band-swatch"
                    value={band.color}
                    disabled={busy}
                    aria-label={t.colors.bandColorAria(band.upTo)}
                    onChange={(event) => updateBandColor(band.id, event.target.value)}
                  />
                  {isLast ? (
                    <span className="color-band-final">{t.colors.finalBandLabel}</span>
                  ) : (
                    <span className="color-band-upto">
                      {t.colors.bandUpToLabel}
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={band.upTo}
                        disabled={busy}
                        aria-label={t.colors.bandUpToAria(index + 1)}
                        onChange={(event) => updateBandUpTo(band.id, Number(event.target.value))}
                      />
                      %
                    </span>
                  )}
                  <button
                    type="button"
                    className="icon-button subtle"
                    disabled={busy || bands.length <= 1}
                    aria-label={t.colors.bandRemoveAria(index + 1)}
                    onClick={() => removeBand(band.id)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="color-band-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={busy || bands.length >= MAX_METER_COLOR_BANDS}
              onClick={addBandRow}
            >
              <Plus size={14} aria-hidden="true" />
              {t.colors.add}
            </button>
            <button type="button" className="secondary-button" disabled={busy} onClick={resetBands}>
              <RotateCcw size={14} aria-hidden="true" />
              {t.colors.reset}
            </button>
          </div>
          {bands.length >= MAX_METER_COLOR_BANDS ? (
            <p className="inline-note">{t.colors.maxBandsNote(MAX_METER_COLOR_BANDS)}</p>
          ) : null}
        </section>

        <section className="settings-section" aria-labelledby="notification-settings-heading">
          <div className="settings-heading heading-with-control">
            <div>
              <span className="eyebrow">{t.settings.notificationsEyebrow}</span>
              <h2 id="notification-settings-heading">{t.settings.notificationsHeading}</h2>
            </div>
            <Toggle
              checked={notifications.enabled}
              disabled={busy}
              label={t.settings.notificationsHeading}
              onChange={(enabled) => void onNotificationsChange({ ...notifications, enabled })}
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>{t.settings.cooldownTitle}</strong>
              <small>{t.settings.cooldownHint}</small>
            </div>
            <select
              value={notifications.cooldownMinutes}
              disabled={busy || !notifications.enabled}
              aria-label={t.settings.cooldownAria}
              onChange={(event) => void onNotificationsChange({ ...notifications, cooldownMinutes: Number(event.target.value) })}
            >
              {cooldownOptions.includes(notifications.cooldownMinutes) ? null : (
                <option value={notifications.cooldownMinutes}>
                  {t.settings.cooldownCustomOption(notifications.cooldownMinutes)}
                </option>
              )}
              {cooldownOptions.map((minutes) => <option key={minutes} value={minutes}>{t.settings.cooldownOption(minutes)}</option>)}
            </select>
          </div>
          <div className="setting-row">
            <div>
              <strong>{t.settings.quietHoursTitle}</strong>
              <small>{t.settings.quietHoursHint}</small>
            </div>
            <Toggle
              checked={notifications.quietHours.enabled}
              disabled={busy || !notifications.enabled}
              label={t.settings.quietHoursTitle}
              onChange={(enabled) => updateQuietHours({ enabled })}
            />
          </div>
          {notifications.quietHours.enabled ? (
            <div className="time-range" aria-label={t.settings.quietHoursRangeAria}>
              <label>
                {t.settings.quietHoursStart}
                <input
                  type="time"
                  value={notifications.quietHours.start}
                  disabled={busy || !notifications.enabled}
                  onChange={(event) => updateQuietHours({ start: event.target.value })}
                />
              </label>
              <span aria-hidden="true">→</span>
              <label>
                {t.settings.quietHoursEnd}
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
            <span className="eyebrow">{t.settings.supportEyebrow}</span>
            <h2 id="diagnostics-heading">{t.settings.diagnosticsHeading}</h2>
          </div>
          <p>{t.settings.diagnosticsHint}</p>
          <button className="secondary-button full-button" type="button" disabled={busy} onClick={onCopyDiagnostics}>
            <Clipboard size={15} aria-hidden="true" />
            {t.settings.diagnosticsCopy}
          </button>
        </section>

        {window.aiUsage.platform === "darwin" ? null : (
          <section className="settings-section diagnostics-section" aria-labelledby="updates-heading">
            <div className="settings-heading">
              <span className="eyebrow">{t.updates.eyebrow}</span>
              <h2 id="updates-heading">{t.updates.heading}</h2>
            </div>
            <p className="update-version">{t.updates.currentVersion(appVersion)}</p>
            {updateStatus.state === "error" ? (
              <div className={`update-error update-error-${updateStatus.errorCode}`} role="alert">
                <div className="update-error-message">
                  <CircleAlert size={17} aria-hidden="true" />
                  <div>
                    <strong>{t.updates.errorHeading}</strong>
                    <p>{updateStatusText(t, updateStatus)}</p>
                  </div>
                </div>
                <details className="update-error-details">
                  <summary>{t.updates.errorDetails}</summary>
                  <code>{updateStatus.diagnosticCode}</code>
                </details>
              </div>
            ) : updateStatusText(t, updateStatus) ? (
              <p className="update-status" role="status">{updateStatusText(t, updateStatus)}</p>
            ) : null}
            {updateStatus.state === "downloaded" && updateStatus.manualInstallCommand ? (
              <div className="manual-update-install">
                <p>
                  <strong>{t.updates.manualInstallTitle}</strong>
                  <br />
                  {t.updates.manualInstallBody}
                </p>
                <code>{updateStatus.manualInstallCommand}</code>
                <button
                  className="secondary-button full-button"
                  type="button"
                  onClick={() => onCopyUpdateCommand(updateStatus.manualInstallCommand!)}
                >
                  <Clipboard size={15} aria-hidden="true" />
                  {t.updates.manualInstallCopy}
                </button>
                <small>{t.updates.manualInstallRestartHint}</small>
                <button className="primary-button full-button" type="button" onClick={onRestartApp}>
                  <RefreshCw size={15} aria-hidden="true" />
                  {t.updates.manualInstallRestart}
                </button>
              </div>
            ) : updateStatus.state === "downloaded" ? (
              <button className="primary-button full-button" type="button" onClick={onInstallUpdate}>
                <RefreshCw size={15} aria-hidden="true" />
                {t.updates.restartAndInstall}
              </button>
            ) : (
              <button
                className="secondary-button full-button"
                type="button"
                disabled={busy || updateStatus.state === "checking" || updateStatus.state === "downloading"}
                onClick={onCheckForUpdates}
              >
                <RefreshCw size={15} aria-hidden="true" />
                {t.updates.check}
              </button>
            )}
          </section>
        )}
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
  const [appVersion, setAppVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: "idle" });
  const [history, setHistory] = useState<Partial<Record<ProviderId, ProviderHistory>>>({});
  const [historyLoading, setHistoryLoading] = useState<ProviderId | null>(null);
  const [historyRange, setHistoryRange] = useState<UsageHistoryRange>("24h");
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusKeyRef = useRef<OverviewFocusKey | null>(null);
  const overviewFocusRefs = useRef<Partial<Record<OverviewFocusKey, HTMLButtonElement | null>>>({});
  const lang: LanguageSetting = snapshot?.settings.language ?? "ko";
  const t = useMemo(() => getTranslations(lang), [lang]);
  const bands = snapshot?.settings.meterColorBands ?? DEFAULT_METER_COLOR_BANDS;
  const i18nValue = useMemo(() => ({ t, lang, bands }), [t, lang, bands]);
  const viewedUsage = view.kind === "provider"
    ? snapshot?.usage.find((item) => item.provider === view.provider)
    : undefined;
  const historyRevision = viewedUsage
    ? [
        viewedUsage.dataUpdatedAt ?? viewedUsage.freshness?.observedAt ?? "",
        ...providerWindows(viewedUsage, t).map((window) =>
          `${window.id}:${window.dataUpdatedAt ?? ""}:${window.percent}:${window.resetsAt ?? ""}`
        )
      ].join("|")
    : "";

  useEffect(() => {
    const theme = snapshot?.settings.theme ?? "system";
    if (theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }, [snapshot?.settings.theme]);

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
            : t.notices.initialLoadFailed);
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
      .catch(() => setNotice(t.notices.launchAtLoginCheckFailed));
  }, []);

  useEffect(() => {
    void window.aiUsage.getAppVersion().then(setAppVersion).catch(() => undefined);
    void window.aiUsage.getUpdateStatus().then(setUpdateStatus).catch(() => undefined);
    return window.aiUsage.onUpdateStatus(setUpdateStatus);
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
          setNotice(t.notices.historyLoadFailed);
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
      setNotice(error instanceof Error ? error.message : t.notices.genericRequestFailed);
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
        : t.notices.initialLoadFailed);
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
      setNotice(t.notices.providerConnected(providerLabel));
    }
  }

  async function oauthLogin(provider: ProviderId) {
    setBusy(true);
    try {
      const result = await window.aiUsage.oauthLogin(provider);
      setSnapshot(result.snapshot);
      setNotice(result.result.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.notices.loginFailed);
    } finally {
      setBusy(false);
    }
  }

  async function logout(provider: ProviderId) {
    if (await runSnapshot(() => window.aiUsage.logout(provider))) {
      setNotice(t.notices.authRemoved);
    }
  }

  async function toggleLaunchAtLogin(enabled: boolean) {
    setBusy(true);
    try {
      setLaunchAtLoginState(await window.aiUsage.setLaunchAtLogin(enabled));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.notices.launchAtLoginChangeFailed);
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
      setNotice(copied ? t.notices.diagnosticsCopied : t.notices.diagnosticsCopyFailedResult);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.notices.diagnosticsCopyFailed);
    } finally {
      setBusy(false);
    }
  }

  function checkForUpdates() {
    void window.aiUsage.checkForUpdates();
  }

  function installUpdate() {
    void window.aiUsage.quitAndInstallUpdate();
  }

  function restartApp() {
    void window.aiUsage.restartApp();
  }

  async function copyUpdateCommand(command: string) {
    setBusy(true);
    try {
      await window.aiUsage.copyText(command);
      setNotice(t.updates.manualInstallCopied);
    } finally {
      setBusy(false);
    }
  }

  function openStatusPage(provider: ProviderId) {
    void window.aiUsage.openStatusPage(provider).catch(() => setNotice(t.notices.statusPageOpenFailed));
  }

  if (view.kind === "provider" && snapshot) {
    const usage = snapshot.usage.find((item) => item.provider === view.provider);
    if (usage) {
      return (
        <I18nContext.Provider value={i18nValue}>
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
        </I18nContext.Provider>
      );
    }
  }

  if (view.kind === "settings" && snapshot) {
    return (
      <I18nContext.Provider value={i18nValue}>
        <main className="shell">
          <SettingsView
            snapshot={snapshot}
            launchAtLogin={launchAtLogin}
            appVersion={appVersion}
            updateStatus={updateStatus}
            busy={busy}
            notice={notice}
            backButtonRef={backButtonRef}
            onBack={goBack}
            onVisibilityChange={(provider, visible) => void setVisibility(provider, visible)}
            onMenuBarModeChange={(mode) => void runSnapshot(() => window.aiUsage.setMenuBarDisplayMode(mode))}
            onRefreshIntervalChange={(milliseconds) => void runSnapshot(() => window.aiUsage.setRefreshIntervalMs(milliseconds))}
            onLaunchAtLoginChange={(enabled) => void toggleLaunchAtLogin(enabled)}
            onThemeChange={(theme) => void runSnapshot(() => window.aiUsage.setTheme(theme))}
            onLanguageChange={(language) => void runSnapshot(() => window.aiUsage.setLanguage(language))}
            onMeterColorBandsChange={(bands) => void runSnapshot(() => window.aiUsage.setMeterColorBands(bands))}
            onNotificationsChange={setNotifications}
            onCopyDiagnostics={() => void copyDiagnostics()}
            onCheckForUpdates={checkForUpdates}
            onInstallUpdate={installUpdate}
            onCopyUpdateCommand={(command) => void copyUpdateCommand(command)}
            onRestartApp={restartApp}
          />
        </main>
      </I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={i18nValue}>
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
          onClose={window.aiUsage.hideWindow}
        />
      </main>
    </I18nContext.Provider>
  );
}
