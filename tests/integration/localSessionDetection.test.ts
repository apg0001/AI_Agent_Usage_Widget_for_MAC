import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("로컬 세션 및 기간별 사용량 연결", () => {
  it("Codex/Claude/Gemini의 로컬 세션과 기간별 초기화 정보를 연결한다", () => {
    const usageProviders = readFileSync(resolve(process.cwd(), "src/main/usageProviders.ts"), "utf8");
    const macPlatform = readFileSync(resolve(process.cwd(), "src/main/platform/mac.ts"), "utf8");
    const platformIndex = readFileSync(resolve(process.cwd(), "src/main/platform/index.ts"), "utf8");
    const renderer = readFileSync(resolve(process.cwd(), "src/renderer/src/App.tsx"), "utf8");

    expect(usageProviders).toContain("https://chatgpt.com/backend-api/wham/usage");
    expect(usageProviders).toContain('".codex"');
    expect(usageProviders).toContain("platformAdapter.readClaudeKeychainAccessToken");
    expect(macPlatform).toContain("Claude Code-credentials");
    expect(macPlatform).toContain("dump-keychain");
    expect(usageProviders).toContain("claudeAiOauth");
    expect(usageProviders).toContain("claude-code/2.1.121");
    expect(platformIndex).toContain('platform === "win32"');
    expect(platformIndex).toContain("linuxPlatform");
    expect(usageProviders).toContain(".gemini");
    expect(usageProviders).toContain("windows");
    expect(usageProviders).toContain("windowLabel");
    expect(usageProviders).toContain("lastSuccessfulUsage");
    expect(renderer).toContain("Google OAuth 로그인");
    expect(renderer).toContain("기간별 사용량");
    expect(renderer).toContain("usage-window-list");
    expect(renderer).not.toContain("API로 연결됨");
    expect(renderer).not.toContain("Codex/Claude는 로컬 세션을 우선 감지하고");
    expect(renderer).not.toContain("Gemini 토큰");
  });
});
