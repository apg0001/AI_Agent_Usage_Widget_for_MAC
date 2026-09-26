export const PANEL_WIDTH = 420;
export const MIN_PANEL_HEIGHT = 180;
export const MAX_PANEL_HEIGHT = 640;

// 트레이 아래에 붙는 팝업이라 작업 영역 가장자리에 16px은 남겨둔다.
const WORK_AREA_MARGIN = 16;

/**
 * 렌더러가 보고한 콘텐츠 높이를 실제로 쓸 수 있는 창 높이로 좁힌다.
 * 작업 영역이 최소 높이보다도 좁은 화면에서는 최소 높이를 포기한다. 그러지 않으면
 * 화면보다 큰 창이 만들어져 위치 보정이 뒤집히고 패널이 작업 영역 밖으로 나간다.
 */
export function clampPanelHeight(height: number, workArea: { height: number }): number {
  const available = Math.min(MAX_PANEL_HEIGHT, Math.max(1, workArea.height - WORK_AREA_MARGIN));
  if (!Number.isFinite(height)) {
    return available;
  }

  const floor = Math.min(MIN_PANEL_HEIGHT, available);
  return Math.max(floor, Math.min(Math.round(height), available));
}
