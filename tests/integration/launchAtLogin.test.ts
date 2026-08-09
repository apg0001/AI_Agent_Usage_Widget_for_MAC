import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("컴퓨터 켤 때 자동 실행", () => {
  it("PlatformAdapter가 로그인 항목 등록 API를 정의한다", () => {
    const types = readFileSync(resolve(process.cwd(), "src/main/platform/types.ts"), "utf8");

    expect(types).toContain("getLaunchAtLogin");
    expect(types).toContain("setLaunchAtLogin");
  });

  it("macOS/Windows는 Electron의 로그인 항목 API를 패키징된 앱에서만 사용한다", () => {
    const loginItem = readFileSync(resolve(process.cwd(), "src/main/platform/loginItem.ts"), "utf8");
    const macPlatform = readFileSync(resolve(process.cwd(), "src/main/platform/mac.ts"), "utf8");
    const windowsPlatform = readFileSync(resolve(process.cwd(), "src/main/platform/windows.ts"), "utf8");

    expect(loginItem).toContain("setLoginItemSettings");
    expect(loginItem).toContain("getLoginItemSettings");
    expect(loginItem).toContain("app.isPackaged");
    expect(macPlatform).toContain("getLoginItemLaunchAtLogin");
    expect(windowsPlatform).toContain("setLoginItemLaunchAtLogin");
  });

  it("Linux는 XDG 자동 시작 스펙에 따라 .desktop 파일로 등록/해제한다", () => {
    const linuxPlatform = readFileSync(resolve(process.cwd(), "src/main/platform/linux.ts"), "utf8");

    expect(linuxPlatform).toContain(".config");
    expect(linuxPlatform).toContain("autostart");
    expect(linuxPlatform).toContain("APPIMAGE");
  });

  it("메인 프로세스가 IPC 채널을 등록하고 preload가 이를 노출한다", () => {
    const main = readFileSync(resolve(process.cwd(), "src/main/main.ts"), "utf8");
    const preload = readFileSync(resolve(process.cwd(), "src/preload/preload.ts"), "utf8");

    expect(main).toContain('"app:get-launch-at-login"');
    expect(main).toContain('"app:set-launch-at-login"');
    expect(preload).toContain("getLaunchAtLogin");
    expect(preload).toContain("setLaunchAtLogin");
  });

  it("렌더러에 자동 시작 토글이 있다", () => {
    const renderer = readFileSync(resolve(process.cwd(), "src/renderer/src/App.tsx"), "utf8");

    expect(renderer).toContain("로그인할 때 자동 실행");
    expect(renderer).toContain("toggleLaunchAtLogin");
  });
});
