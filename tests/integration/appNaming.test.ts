import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("앱 이름", () => {
  it("주요 표시 표면에서 GigaCharge를 사용한다", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      name: string;
      build: { appId: string; productName: string };
    };
    const renderer = readFileSync(resolve(process.cwd(), "src/renderer/src/App.tsx"), "utf8");
    const html = readFileSync(resolve(process.cwd(), "src/renderer/index.html"), "utf8");
    const main = readFileSync(resolve(process.cwd(), "src/main/main.ts"), "utf8");
    const i18n = readFileSync(resolve(process.cwd(), "src/shared/i18n.ts"), "utf8");

    expect(packageJson.name).toBe("quota-bar");
    expect(packageJson.build.appId).toBe("com.apg0001.aiusagewidget");
    expect(packageJson.build.productName).toBe("GigaCharge");
    expect(renderer).toContain("<h1>{t.common.appName}</h1>");
    expect(html).toContain("<title>GigaCharge</title>");
    expect(main).toContain("t.main.trayOpen");
    expect(i18n).toContain('trayOpen: "GigaCharge 열기"');
  });
});
