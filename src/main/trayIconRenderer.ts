import { BrowserWindow, NativeImage, nativeImage } from "electron";

// 이미 실패한 경로에서 오래 기다릴수록 시작과 갱신이 통째로 지연된다.
const PAINT_TIMEOUT_MS = 1_500;

// 크기마다 전용 창을 둔다. 하나를 setContentSize로 돌려쓰면 리사이즈가 합성 표면을 갈아
// 끼우면서 그 뒤로는 paint가 계속 "직전 프레임"을 흘린다(32 -> 128 전환 후 매 갱신마다
// 한 박자씩 밀림). 창을 destroy하고 새로 만드는 방법도 쓸 수 없다. 파괴 이후 새로 만든
// 창에서는 data: URL 로드가 ERR_FAILED로 실패한다.
const renderWindows = new Map<number, BrowserWindow>();
let renderChain: Promise<unknown> = Promise.resolve();

/**
 * nativeImage.createFromDataURL은 PNG/JPEG 같은 래스터 포맷만 디코딩하고 SVG는 지원하지 않아
 * 조용히 빈 이미지를 반환한다(트레이 아이콘이 투명하게 보이는 원인). 실제 SVG 렌더링이 가능한
 * 숨겨진 BrowserWindow에 그린 뒤 그 프레임을 비트맵으로 받아 이 문제를 우회한다.
 *
 * 화면에 띄우지 않는 창은 합성 표면이 없고, Electron 43부터 capturePage()가 그런 창에서
 * UnknownVizError로 거부한다. 오프스크린 렌더링은 표면 없이도 프레임을 만들어내므로
 * capturePage 대신 paint 이벤트로 비트맵을 받는다.
 */
function getRenderWindow(size: number): BrowserWindow {
  const existing = renderWindows.get(size);
  if (existing && !existing.isDestroyed()) {
    return existing;
  }

  const created = new BrowserWindow({
    width: size,
    height: size,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: { offscreen: true }
  });
  renderWindows.set(size, created);
  return created;
}

// 윈도우는 프레임 없는 창에도 최소 높이를 강제해서 32px를 요청해도 39px짜리 창이 만들어진다.
// SVG는 페이지 좌상단에 그려지므로 정사각형으로 잘라 요청한 비율을 지킨다.
function cropToSquare(image: NativeImage): NativeImage {
  const { width, height } = image.getSize();
  if (width === 0 || height === 0 || width === height) {
    return image;
  }
  const side = Math.min(width, height);
  return image.crop({ x: 0, y: 0, width: side, height: side });
}

type FrameCapture = { frame: Promise<NativeImage>; cancel: () => void };

function captureNextFrame(win: BrowserWindow): FrameCapture {
  let settle: (() => void) | undefined;
  const frame = new Promise<NativeImage>((resolve, reject) => {
    const onPaint = (_details: unknown, _dirtyRect: unknown, image: NativeImage) => {
      settle?.();
      // 합성기가 다음 프레임에 이 비트맵의 공유 메모리를 재사용할 수 있어, 핸들러 밖으로
      // 그대로 들고 나가면 찢어진 이미지가 될 수 있다. 여기서 복사본을 뜬다.
      resolve(nativeImage.createFromBuffer(image.toBitmap(), image.getSize()));
    };
    const timer = setTimeout(() => {
      settle?.();
      reject(new Error("Tray icon rendering timed out before the first frame."));
    }, PAINT_TIMEOUT_MS);

    settle = () => {
      settle = undefined;
      clearTimeout(timer);
      if (!win.isDestroyed()) {
        win.webContents.off("paint", onPaint);
      }
    };
    win.webContents.once("paint", onPaint);
  });

  // 거부를 아무도 듣지 않으면 메인 프로세스가 통째로 죽는다. 취소 경로에서도 안전하도록
  // 삼킴 핸들러를 붙여두고, 호출자에게는 원본 프라미스를 그대로 돌려준다.
  frame.catch(() => undefined);
  return { frame, cancel: () => settle?.() };
}

export function renderSvgToNativeImage(svg: string, size: number): Promise<NativeImage> {
  // 창을 공유하므로 갱신이 겹치면 두 페이지가 같은 창을 두고 경쟁해 프레임이 섞인다.
  const rendered = renderChain.then(async () => {
    const win = getRenderWindow(size);
    const html = `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;}svg{display:block;}</style></head><body>${svg}</body></html>`;
    // paint는 탐색 도중에 발생하므로 loadURL을 기다리기 전에 먼저 구독해야 한 프레임도 놓치지
    // 않는다. loadURL이 완료된 뒤 invalidate()로 프레임을 강제하는 방법은 빈 프레임만 돌려준다.
    const capture = captureNextFrame(win);
    try {
      await win.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    } catch (error) {
      // 탐색이 실패하면 기다리던 프레임은 영영 오지 않는다. 리스너와 타이머를 여기서 건다.
      capture.cancel();
      throw error;
    }
    return cropToSquare(await capture.frame);
  });
  renderChain = rendered.catch(() => undefined);
  return rendered;
}

export function destroyTrayIconRenderer() {
  for (const win of renderWindows.values()) {
    if (!win.isDestroyed()) {
      win.destroy();
    }
  }
  renderWindows.clear();
}
