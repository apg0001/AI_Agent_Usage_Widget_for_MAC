import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("OAuth 제공자 설정", () => {
  it("Gemini OAuth는 환경변수 기반 클라이언트 설정을 사용한다", () => {
    const source = readFileSync(resolve(process.cwd(), "src/main/oauthProviders.ts"), "utf8");

    expect(source).toContain("GEMINI_OAUTH_CLIENT_ID");
    expect(source).toContain("GEMINI_OAUTH_CLIENT_SECRET");
    expect(source).toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(source).toContain("oauth2.googleapis.com/token");
  });
});
