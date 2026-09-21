import { describe, expect, it } from "vitest";
import { parseAntigravityToken } from "../../src/main/platform/antigravityCredential";

describe("Antigravity 키링 값 해석", () => {
  it("JSON 객체에서 액세스 토큰을 꺼낸다", () => {
    expect(parseAntigravityToken(JSON.stringify({ access_token: "ya29.token" }))).toBe("ya29.token");
    expect(parseAntigravityToken(JSON.stringify({ accessToken: "ya29.camel" }))).toBe("ya29.camel");
  });

  it("중첩된 객체 안의 토큰도 찾는다", () => {
    const raw = JSON.stringify({ credentials: { oauth: { access_token: "ya29.nested" } } });
    expect(parseAntigravityToken(raw)).toBe("ya29.nested");
  });

  it("JSON이 아니면 공백 없는 값만 토큰으로 받는다", () => {
    expect(parseAntigravityToken("ya29.bare-token")).toBe("ya29.bare-token");
    expect(parseAntigravityToken("error: no credential found")).toBeNull();
  });

  it("빈 값과 토큰이 없는 객체는 거른다", () => {
    expect(parseAntigravityToken(null)).toBeNull();
    expect(parseAntigravityToken("   ")).toBeNull();
    expect(parseAntigravityToken(JSON.stringify({ user: "someone" }))).toBeNull();
  });
});
