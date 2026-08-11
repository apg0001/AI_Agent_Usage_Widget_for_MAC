import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachPanelAutoHideWindowEvents,
  AutoHidePanel,
  PanelAutoHideController
} from "../../src/main/panelAutoHide";

class FakePanel extends EventEmitter implements AutoHidePanel {
  destroyed = false;
  visible = true;
  focused = true;
  hide = vi.fn(() => {
    this.visible = false;
  });

  isDestroyed() {
    return this.destroyed;
  }

  isVisible() {
    return this.visible;
  }

  isFocused() {
    return this.focused;
  }
}

function createController(panel: FakePanel) {
  return new PanelAutoHideController(() => panel, {
    hideDelayMs: 100,
    focusCheckIntervalMs: 50
  });
}

describe("PanelAutoHideController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("포커스를 잃은 패널을 지연 후 숨긴다", () => {
    const panel = new FakePanel();
    const controller = createController(panel);
    controller.prepareForShow();
    controller.handleShown();
    controller.handleFocused();

    panel.focused = false;
    controller.handleFocusLost();
    vi.advanceTimersByTime(99);
    expect(panel.hide).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(panel.hide).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("네이티브 blur 뒤 포커스 조회값이 늦게 갱신돼도 숨긴다", () => {
    const panel = new FakePanel();
    const controller = createController(panel);
    controller.prepareForShow();
    controller.handleShown();
    controller.handleFocused();

    controller.handleFocusLost();
    vi.advanceTimersByTime(100);

    expect(panel.hide).toHaveBeenCalledTimes(1);
  });

  it("blur 이벤트가 누락돼도 포커스 감시로 숨긴다", () => {
    const panel = new FakePanel();
    const controller = createController(panel);
    controller.prepareForShow();
    controller.handleShown();
    controller.handleFocused();

    panel.focused = false;
    vi.advanceTimersByTime(149);
    expect(panel.hide).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(panel.hide).toHaveBeenCalledTimes(1);
  });

  it("숨김 대기 중 다시 포커스되면 닫지 않는다", () => {
    const panel = new FakePanel();
    const controller = createController(panel);
    controller.prepareForShow();
    controller.handleShown();
    controller.handleFocused();

    panel.focused = false;
    controller.handleFocusLost();
    vi.advanceTimersByTime(50);
    panel.focused = true;
    controller.handleFocused();
    vi.advanceTimersByTime(200);

    expect(panel.hide).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("watchdog 대기 중 포커스 상태가 복구되면 focus 이벤트가 없어도 취소한다", () => {
    const panel = new FakePanel();
    const controller = createController(panel);
    controller.prepareForShow();
    controller.handleShown();
    controller.handleFocused();

    panel.focused = false;
    vi.advanceTimersByTime(50);
    panel.focused = true;
    vi.advanceTimersByTime(200);

    expect(panel.hide).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("authoritative blur 뒤 false에서 true로 복구되면 focus 이벤트 없이도 취소한다", () => {
    const panel = new FakePanel();
    const controller = new PanelAutoHideController(() => panel, {
      hideDelayMs: 150,
      focusCheckIntervalMs: 50
    });
    controller.prepareForShow();
    controller.handleShown();
    controller.handleFocused();

    panel.focused = false;
    controller.handleFocusLost();
    vi.advanceTimersByTime(50);
    panel.focused = true;
    vi.advanceTimersByTime(200);

    expect(panel.hide).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("authoritative blur 마감 직전의 이벤트 없는 포커스 복구도 숨기지 않는다", () => {
    const panel = new FakePanel();
    const controller = new PanelAutoHideController(() => panel, {
      hideDelayMs: 120,
      focusCheckIntervalMs: 100
    });
    controller.prepareForShow();
    controller.handleShown();
    controller.handleFocused();

    // Electron can briefly report stale focus after blur. Polling proves the
    // loss, then focus recovers without an event just before the hide timer.
    controller.handleFocusLost();
    vi.advanceTimersByTime(1);
    panel.focused = false;
    vi.advanceTimersByTime(99);
    panel.focused = true;
    vi.advanceTimersByTime(20);

    expect(panel.hide).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("중복 focus-loss 신호가 숨김 시점을 미루거나 여러 번 숨기지 않는다", () => {
    const panel = new FakePanel();
    const controller = createController(panel);
    controller.prepareForShow();
    controller.handleShown();
    controller.handleFocused();

    panel.focused = false;
    controller.handleFocusLost();
    vi.advanceTimersByTime(50);
    controller.handleFocusLost();
    vi.advanceTimersByTime(50);

    expect(panel.hide).toHaveBeenCalledTimes(1);
  });

  it("Windows 표시 직후의 일시적 blur에는 grace를 적용한다", () => {
    const panel = new FakePanel();
    const controller = new PanelAutoHideController(() => panel, {
      hideDelayMs: 100,
      focusCheckIntervalMs: 50,
      showGraceMs: 350
    });
    controller.prepareForShow();
    controller.handleShown();
    controller.handleFocused();

    panel.focused = false;
    controller.handleFocusLost();
    expect(controller.needsFocusRetry()).toBe(true);
    vi.advanceTimersByTime(349);
    expect(panel.hide).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(panel.hide).toHaveBeenCalledTimes(1);
  });

  it("포커스를 얻었다가 표시 직후 잃으면 후속 포커스 재시도를 허용한다", () => {
    const panel = new FakePanel();
    const controller = createController(panel);
    controller.prepareForShow();
    controller.handleShown();
    controller.handleFocused();
    expect(controller.needsFocusRetry()).toBe(false);

    controller.handleFocusLost();

    expect(controller.needsFocusRetry()).toBe(true);
    controller.dispose();
  });

  it("포커스 재시도는 같은 loss 세대의 실제 false에서 true 전환만 확정한다", () => {
    const recoveredPanel = new FakePanel();
    const recoveredController = createController(recoveredPanel);
    recoveredController.prepareForShow();
    recoveredController.handleShown();
    recoveredController.handleFocused();
    recoveredPanel.focused = false;
    recoveredController.handleFocusLost();
    const recoveredSequence = recoveredController.getFocusLossSequence();
    recoveredPanel.focused = true;
    recoveredController.confirmFocusRetry(false, recoveredSequence);
    vi.advanceTimersByTime(100);
    expect(recoveredPanel.hide).not.toHaveBeenCalled();
    recoveredController.dispose();

    const stalePanel = new FakePanel();
    const staleController = createController(stalePanel);
    staleController.prepareForShow();
    staleController.handleShown();
    staleController.handleFocused();
    staleController.handleFocusLost();
    const staleSequence = staleController.getFocusLossSequence();
    staleController.confirmFocusRetry(true, staleSequence);
    vi.advanceTimersByTime(100);
    expect(stalePanel.hide).toHaveBeenCalledTimes(1);
  });

  it("포커스 재시도 중 새 blur가 오면 이전 재시도 결과로 취소하지 않는다", () => {
    const panel = new FakePanel();
    const controller = createController(panel);
    controller.prepareForShow();
    controller.handleShown();
    controller.handleFocused();
    panel.focused = false;
    controller.handleFocusLost();
    const previousSequence = controller.getFocusLossSequence();

    panel.focused = true;
    controller.handleFocused();
    controller.handleFocusLost();
    controller.confirmFocusRetry(false, previousSequence);
    vi.advanceTimersByTime(100);

    expect(panel.hide).toHaveBeenCalledTimes(1);
  });

  it("숨긴 뒤 빠르게 다시 연 패널을 이전 타이머가 닫지 않는다", () => {
    const panel = new FakePanel();
    const controller = createController(panel);
    controller.prepareForShow();
    controller.handleShown();
    controller.handleFocused();

    panel.focused = false;
    controller.handleFocusLost();
    controller.handleHidden();

    panel.visible = true;
    panel.focused = true;
    controller.prepareForShow();
    controller.handleShown();
    controller.handleFocused();
    vi.advanceTimersByTime(200);

    expect(panel.hide).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("파괴됐거나 이미 숨은 패널에는 hide를 호출하지 않는다", () => {
    const panel = new FakePanel();
    const controller = createController(panel);
    controller.prepareForShow();
    controller.handleShown();
    controller.handleFocused();

    panel.focused = false;
    panel.destroyed = true;
    controller.handleFocusLost();
    vi.advanceTimersByTime(100);

    expect(panel.hide).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("포커스를 한 번도 얻지 못한 표시 주기는 감시기가 즉시 닫지 않는다", () => {
    const panel = new FakePanel();
    panel.focused = false;
    const controller = createController(panel);
    controller.prepareForShow();
    controller.handleShown();

    vi.advanceTimersByTime(500);

    expect(panel.hide).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    controller.dispose();
  });

  it("표시 직후 focus 이벤트가 누락돼도 상태 조회로 감시를 활성화한다", () => {
    const panel = new FakePanel();
    panel.focused = false;
    const controller = createController(panel);
    controller.prepareForShow();
    controller.handleShown();
    expect(controller.needsFocusRetry()).toBe(true);

    panel.focused = true;
    vi.advanceTimersByTime(50);
    expect(controller.needsFocusRetry()).toBe(false);

    panel.focused = false;
    vi.advanceTimersByTime(150);
    expect(panel.hide).toHaveBeenCalledTimes(1);
  });

  it("dispose 뒤 들어오는 이벤트는 타이머를 다시 만들지 않는다", () => {
    const panel = new FakePanel();
    const controller = createController(panel);
    controller.prepareForShow();
    controller.handleShown();
    controller.handleFocused();
    controller.dispose();

    panel.focused = false;
    controller.handleFocusLost();
    controller.handleShown();
    controller.handleFocused();
    vi.advanceTimersByTime(500);

    expect(panel.hide).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("창 이벤트 binder가 show/focus/blur/hide를 공통 컨트롤러에 연결한다", () => {
    const panel = new FakePanel();
    const controller = createController(panel);
    controller.prepareForShow();
    const detach = attachPanelAutoHideWindowEvents(panel, controller);

    panel.emit("show");
    panel.emit("focus");
    panel.focused = false;
    panel.emit("blur");
    vi.advanceTimersByTime(100);
    expect(panel.hide).toHaveBeenCalledTimes(1);

    panel.emit("hide");
    detach();
    expect(vi.getTimerCount()).toBe(0);
  });
});
