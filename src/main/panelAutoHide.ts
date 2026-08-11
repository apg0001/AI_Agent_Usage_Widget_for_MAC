export interface AutoHidePanel {
  isDestroyed(): boolean;
  isVisible(): boolean;
  isFocused(): boolean;
  hide(): void;
}

export type PanelAutoHideOptions = {
  hideDelayMs?: number;
  focusCheckIntervalMs?: number;
  focusAcquisitionMs?: number;
  showGraceMs?: number;
};

const DEFAULT_HIDE_DELAY_MS = 120;
const DEFAULT_FOCUS_CHECK_INTERVAL_MS = 100;
const DEFAULT_FOCUS_ACQUISITION_MS = 500;
const DEFAULT_SHOW_GRACE_MS = 0;

type PanelAutoHideEvent = "blur" | "focus" | "show" | "hide" | "closed";

export interface AutoHidePanelEventSource {
  on(event: PanelAutoHideEvent, listener: () => void): unknown;
  off(event: PanelAutoHideEvent, listener: () => void): unknown;
}

/**
 * Hides the tray panel after it loses focus.
 *
 * BrowserWindow's blur event is the primary signal. The short-lived focus
 * watcher is a fallback for Linux window managers that update isFocused()
 * without reliably forwarding the blur event for frameless always-on-top
 * windows.
 */
export class PanelAutoHideController {
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private focusCheckTimer: ReturnType<typeof setInterval> | null = null;
  private hasObservedFocusSinceShow = false;
  private focusCurrentlyHeld = false;
  private focusLossSequence = 0;
  private generation = 0;
  private shownAt = 0;
  private authoritativeLoss = false;
  private observedUnfocusedAfterLoss = false;
  private focusAcquisitionDeadline = 0;
  private disposed = false;
  private readonly hideDelayMs: number;
  private readonly focusCheckIntervalMs: number;
  private readonly focusAcquisitionMs: number;
  private readonly showGraceMs: number;

  constructor(
    private readonly getPanel: () => AutoHidePanel | null,
    options: PanelAutoHideOptions = {}
  ) {
    this.hideDelayMs = options.hideDelayMs ?? DEFAULT_HIDE_DELAY_MS;
    this.focusCheckIntervalMs = options.focusCheckIntervalMs ?? DEFAULT_FOCUS_CHECK_INTERVAL_MS;
    this.focusAcquisitionMs = options.focusAcquisitionMs ?? DEFAULT_FOCUS_ACQUISITION_MS;
    this.showGraceMs = options.showGraceMs ?? DEFAULT_SHOW_GRACE_MS;
  }

  prepareForShow() {
    if (this.disposed) {
      return;
    }

    this.generation += 1;
    this.hasObservedFocusSinceShow = false;
    this.focusCurrentlyHeld = false;
    this.shownAt = Date.now();
    this.focusAcquisitionDeadline = Date.now() + this.focusAcquisitionMs;
    this.clearHideTimer();
    this.stopFocusWatcher();
  }

  handleShown() {
    if (this.disposed) {
      return;
    }

    if (!this.shownAt) {
      this.shownAt = Date.now();
    }
    if (!this.focusAcquisitionDeadline) {
      this.focusAcquisitionDeadline = Date.now() + this.focusAcquisitionMs;
    }
    this.startFocusWatcher();
    this.checkFocus();
  }

  handleFocused() {
    if (this.disposed) {
      return;
    }

    this.generation += 1;
    this.hasObservedFocusSinceShow = true;
    this.focusCurrentlyHeld = true;
    this.focusAcquisitionDeadline = 0;
    this.clearHideTimer();
    this.startFocusWatcher();
  }

  handleFocusLost() {
    if (this.disposed) {
      return;
    }

    // A blur event proves that this display cycle previously had focus even
    // if a platform failed to deliver the matching focus event.
    this.hasObservedFocusSinceShow = true;
    this.focusCurrentlyHeld = false;
    this.focusLossSequence += 1;
    this.observedUnfocusedAfterLoss = this.getPanel()?.isFocused() === false;
    this.scheduleHide(true);
  }

  handleHidden() {
    if (this.disposed) {
      return;
    }

    this.generation += 1;
    this.hasObservedFocusSinceShow = false;
    this.focusCurrentlyHeld = false;
    this.shownAt = 0;
    this.focusAcquisitionDeadline = 0;
    this.clearHideTimer();
    this.stopFocusWatcher();
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.generation += 1;
    this.hasObservedFocusSinceShow = false;
    this.focusCurrentlyHeld = false;
    this.shownAt = 0;
    this.focusAcquisitionDeadline = 0;
    this.clearHideTimer();
    this.stopFocusWatcher();
  }

  needsFocusRetry() {
    return !this.disposed && !this.focusCurrentlyHeld;
  }

  getFocusLossSequence() {
    return this.focusLossSequence;
  }

  confirmFocusRetry(previouslyFocused: boolean, expectedFocusLossSequence: number) {
    if (
      this.disposed ||
      previouslyFocused ||
      this.focusLossSequence !== expectedFocusLossSequence
    ) {
      return;
    }

    const panel = this.getPanel();
    if (panel && !panel.isDestroyed() && panel.isVisible() && panel.isFocused()) {
      this.handleFocused();
    }
  }

  private startFocusWatcher() {
    if (this.focusCheckTimer) {
      return;
    }

    this.focusCheckTimer = setInterval(() => this.checkFocus(), this.focusCheckIntervalMs);
  }

  private stopFocusWatcher() {
    if (!this.focusCheckTimer) {
      return;
    }

    clearInterval(this.focusCheckTimer);
    this.focusCheckTimer = null;
  }

  private checkFocus() {
    const panel = this.getPanel();
    if (!panel || panel.isDestroyed() || !panel.isVisible()) {
      this.handleHidden();
      return;
    }

    if (panel.isFocused()) {
      if (
        !this.hasObservedFocusSinceShow ||
        (this.hideTimer && (!this.authoritativeLoss || this.observedUnfocusedAfterLoss))
      ) {
        this.handleFocused();
      }
      return;
    }

    if (this.hasObservedFocusSinceShow) {
      this.focusCurrentlyHeld = false;
      if (this.authoritativeLoss) {
        this.observedUnfocusedAfterLoss = true;
      }
      this.scheduleHide(false);
      return;
    }

    if (this.focusAcquisitionDeadline && Date.now() >= this.focusAcquisitionDeadline) {
      this.focusAcquisitionDeadline = 0;
      this.stopFocusWatcher();
    }
  }

  private scheduleHide(authoritative: boolean) {
    const panel = this.getPanel();
    if (!panel || panel.isDestroyed() || !panel.isVisible()) {
      return;
    }

    if (this.hideTimer) {
      this.authoritativeLoss ||= authoritative;
      if (authoritative && !panel.isFocused()) {
        this.observedUnfocusedAfterLoss = true;
      }
      return;
    }

    const scheduledGeneration = this.generation;
    const graceRemaining = Math.max(0, this.shownAt + this.showGraceMs - Date.now());
    const delay = Math.max(this.hideDelayMs, graceRemaining);
    this.authoritativeLoss = authoritative;
    this.observedUnfocusedAfterLoss = authoritative && !panel.isFocused();
    let timer: ReturnType<typeof setTimeout>;
    timer = setTimeout(() => {
      if (this.hideTimer !== timer) {
        return;
      }

      this.hideTimer = null;
      const authoritativeAtDeadline = this.authoritativeLoss;
      const observedUnfocusedAtDeadline = this.observedUnfocusedAfterLoss;
      this.authoritativeLoss = false;
      this.observedUnfocusedAfterLoss = false;
      if (scheduledGeneration !== this.generation) {
        return;
      }

      const panel = this.getPanel();
      if (!panel || panel.isDestroyed() || !panel.isVisible()) {
        this.stopFocusWatcher();
        return;
      }
      if (
        panel.isFocused() &&
        (!authoritativeAtDeadline || observedUnfocusedAtDeadline)
      ) {
        this.handleFocused();
        return;
      }

      panel.hide();
      this.hasObservedFocusSinceShow = false;
      this.focusCurrentlyHeld = false;
      this.stopFocusWatcher();
    }, delay);
    this.hideTimer = timer;
  }

  private clearHideTimer() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
    }

    this.hideTimer = null;
    this.authoritativeLoss = false;
    this.observedUnfocusedAfterLoss = false;
  }
}

export function attachPanelAutoHideWindowEvents(
  panel: AutoHidePanelEventSource,
  controller: PanelAutoHideController
) {
  let detached = false;
  const onBlur = () => controller.handleFocusLost();
  const onFocus = () => controller.handleFocused();
  const onShow = () => controller.handleShown();
  const onHide = () => controller.handleHidden();
  const onClosed = () => detach();

  panel.on("blur", onBlur);
  panel.on("focus", onFocus);
  panel.on("show", onShow);
  panel.on("hide", onHide);
  panel.on("closed", onClosed);

  function detach() {
    if (detached) {
      return;
    }

    detached = true;
    panel.off("blur", onBlur);
    panel.off("focus", onFocus);
    panel.off("show", onShow);
    panel.off("hide", onHide);
    panel.off("closed", onClosed);
    controller.dispose();
  }

  return detach;
}
