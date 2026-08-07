import { BrowserWindow, NativeImage } from "electron";

let renderWindow: BrowserWindow | null = null;

/**
 * nativeImage.createFromDataURL은 PNG/JPEG 같은 래스터 포맷만 디코딩하고 SVG는 지원하지 않아
 * 조용히 빈 이미지를 반환한다(트레이 아이콘이 투명하게 보이는 원인). 실제 SVG 렌더링이 가능한
 * 숨겨진 BrowserWindow에 그린 뒤 capturePage로 비트맵을 얻어 이 문제를 우회한다.
 */
function getRenderWindow(size: number): BrowserWindow {
  if (!renderWindow || renderWindow.isDestroyed()) {
    renderWindow = new BrowserWindow({
      width: size,
      height: size,
      useContentSize: true,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      webPreferences: { offscreen: false }
    });
  } else if (renderWindow.getContentSize()[0] !== size) {
    renderWindow.setContentSize(size, size);
  }
  return renderWindow;
}

export async function renderSvgToNativeImage(svg: string, size: number): Promise<NativeImage> {
  const win = getRenderWindow(size);
  const html = `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;}svg{display:block;}</style></head><body>${svg}</body></html>`;
  await win.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
  // loadURL이 완료돼도 첫 프레임 합성이 늦게 끝나는 경우가 있어 한 틱 더 기다린다.
  await new Promise((resolve) => setTimeout(resolve, 30));
  return win.webContents.capturePage();
}

export function destroyTrayIconRenderer() {
  if (renderWindow && !renderWindow.isDestroyed()) {
    renderWindow.destroy();
  }
  renderWindow = null;
}
