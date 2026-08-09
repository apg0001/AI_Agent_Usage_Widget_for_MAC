import { App } from "electron";

/**
 * macOS/Windows는 Electron의 app.setLoginItemSettings로 로그인 시 자동 실행을 등록할 수 있다.
 * 패키징되지 않은 개발 실행(electron .) 상태에서 등록하면 electron 셸 자체가 로그인 항목으로
 * 잡혀버려 다음 로그인 때 개발 환경이 뜨는 사고가 나므로, 패키징된 앱에서만 동작하게 한다.
 */
export function getLoginItemLaunchAtLogin(app: App): boolean {
  if (!app.isPackaged) {
    return false;
  }
  return app.getLoginItemSettings().openAtLogin;
}

export function setLoginItemLaunchAtLogin(app: App, enabled: boolean): void {
  if (!app.isPackaged) {
    return;
  }
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
}
