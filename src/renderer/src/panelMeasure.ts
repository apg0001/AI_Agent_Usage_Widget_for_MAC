type MeasurableRect = { top: number; bottom: number };

export type MeasurableElement = {
  children: ArrayLike<{ getBoundingClientRect: () => MeasurableRect }>;
  scrollHeight: number;
  clientHeight: number;
};

type PaddingStyle = { paddingTop: string; paddingBottom: string };

function readPadding(style: PaddingStyle) {
  return (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
}

/**
 * 스크롤 영역이 실제로 차지하는 내용 높이를 잰다.
 *
 * 내용이 박스보다 길면 scrollHeight가 정확하다. 짧을 때는 scrollHeight가 박스 높이에서
 * 바닥이 막혀 창이 절대 줄지 않으므로(카드 하나만 켜도 640px 유지) 자식들이 실제로
 * 차지한 범위를 직접 잰다. 컨테이너가 align-content: start인 grid라 첫 자식 위쪽부터
 * 마지막 자식 아래쪽까지가 곧 내용 높이다.
 *
 * position: sticky인 자식은 스크롤되면 위쪽에 고정돼 범위 계산을 망가뜨리지만, 그런 상황은
 * 내용이 넘칠 때만 생기고 그때는 scrollHeight 경로를 타므로 여기서 따로 걸러낼 필요가 없다.
 */
export function measureContentHeight(
  content: MeasurableElement,
  readStyle: (element: MeasurableElement) => PaddingStyle =
    (element) => globalThis.getComputedStyle(element as never)
): number {
  if (content.scrollHeight > content.clientHeight) {
    return content.scrollHeight;
  }

  const padding = readPadding(readStyle(content));
  const first = content.children[0];
  const last = content.children[content.children.length - 1];
  if (!first || !last) {
    return padding;
  }

  const span = last.getBoundingClientRect().bottom - first.getBoundingClientRect().top;
  return Math.max(0, span) + padding;
}
