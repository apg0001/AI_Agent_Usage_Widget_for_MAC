import { describe, expect, it } from "vitest";
import { measureContentHeight, MeasurableElement } from "../../src/renderer/src/panelMeasure";

function child(top: number, bottom: number) {
  return { getBoundingClientRect: () => ({ top, bottom }) };
}

function element(partial: Partial<MeasurableElement>): MeasurableElement {
  return { children: [], scrollHeight: 0, clientHeight: 0, ...partial };
}

const noPadding = () => ({ paddingTop: "0px", paddingBottom: "0px" });

describe("스크롤 영역 내용 높이 측정", () => {
  it("큰 박스 안의 짧은 카드 하나는 박스가 아니라 카드 높이를 돌려준다", () => {
    // scrollHeight를 그대로 쓰면 480이 나와 창이 줄지 않는다. 이게 이 함수가 존재하는 이유다.
    const content = element({ children: [child(0, 150)], scrollHeight: 480, clientHeight: 480 });

    expect(measureContentHeight(content, noPadding)).toBe(150);
  });

  it("카드 사이 간격까지 포함해 첫 카드 위부터 마지막 카드 아래까지 잰다", () => {
    const content = element({
      children: [child(0, 150), child(160, 310), child(320, 470)],
      scrollHeight: 480,
      clientHeight: 480
    });

    expect(measureContentHeight(content, noPadding)).toBe(470);
  });

  it("세로 패딩을 더한다", () => {
    const content = element({ children: [child(0, 100)], scrollHeight: 400, clientHeight: 400 });
    const padded = () => ({ paddingTop: "8px", paddingBottom: "12px" });

    expect(measureContentHeight(content, padded)).toBe(120);
  });

  it("내용이 넘치면 scrollHeight를 그대로 쓴다", () => {
    // 넘칠 때는 sticky 자식이 범위 계산을 망가뜨리므로 이 경로로 빠져야 한다.
    const content = element({ children: [child(200, 260)], scrollHeight: 1200, clientHeight: 480 });

    expect(measureContentHeight(content, noPadding)).toBe(1200);
  });

  it("자식이 없으면 패딩만 남는다", () => {
    const content = element({ children: [], scrollHeight: 300, clientHeight: 300 });
    const padded = () => ({ paddingTop: "4px", paddingBottom: "6px" });

    expect(measureContentHeight(content, padded)).toBe(10);
  });

  it("패딩을 숫자로 읽을 수 없으면 0으로 본다", () => {
    const content = element({ children: [child(0, 50)], scrollHeight: 200, clientHeight: 200 });
    const weird = () => ({ paddingTop: "auto", paddingBottom: "" });

    expect(measureContentHeight(content, weird)).toBe(50);
  });

  it("범위가 음수로 나와도 0 아래로 내려가지 않는다", () => {
    const content = element({ children: [child(100, 90)], scrollHeight: 200, clientHeight: 200 });

    expect(measureContentHeight(content, noPadding)).toBe(0);
  });
});
