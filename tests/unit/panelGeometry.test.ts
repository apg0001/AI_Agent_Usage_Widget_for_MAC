import { describe, expect, it } from "vitest";
import {
  clampPanelHeight,
  MAX_PANEL_HEIGHT,
  MIN_PANEL_HEIGHT
} from "../../src/main/panelGeometry";

const roomyScreen = { height: 1380 };

describe("패널 높이 계산", () => {
  it("내용이 짧으면 그대로 따라간다", () => {
    expect(clampPanelHeight(249, roomyScreen)).toBe(249);
  });

  it("상한을 넘는 내용은 잘라 스크롤에 맡긴다", () => {
    expect(clampPanelHeight(2000, roomyScreen)).toBe(MAX_PANEL_HEIGHT);
  });

  it("너무 짧은 값은 최소 높이로 올린다", () => {
    expect(clampPanelHeight(40, roomyScreen)).toBe(MIN_PANEL_HEIGHT);
  });

  it("작업 영역이 좁으면 여백 16px을 뺀 높이까지만 쓴다", () => {
    expect(clampPanelHeight(640, { height: 400 })).toBe(384);
  });

  it("작업 영역이 최소 높이보다 좁으면 화면을 넘기지 않는다", () => {
    // 최소 높이를 고집하면 창이 화면보다 커져 위치 보정이 뒤집힌다.
    const height = clampPanelHeight(640, { height: 120 });
    expect(height).toBe(104);
    expect(height).toBeLessThan(MIN_PANEL_HEIGHT);
  });

  it("측정값이 없거나 숫자가 아니면 쓸 수 있는 최대치를 쓴다", () => {
    expect(clampPanelHeight(Number.NaN, roomyScreen)).toBe(MAX_PANEL_HEIGHT);
    expect(clampPanelHeight(Number.POSITIVE_INFINITY, { height: 400 })).toBe(384);
  });

  it("소수점 측정값은 반올림한다", () => {
    expect(clampPanelHeight(248.4, roomyScreen)).toBe(248);
    expect(clampPanelHeight(248.6, roomyScreen)).toBe(249);
  });
});
