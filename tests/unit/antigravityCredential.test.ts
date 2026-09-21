import { describe, expect, it } from "vitest";
import { parseAntigravityCredential } from "../../src/main/platform/antigravityCredential";

describe("Antigravity 키링 자격 증명 해석", () => {
  // Antigravity CLI 1.2.7이 Windows 자격 증명 관리자에 실제로 저장하는 형태.
  const realShape = JSON.stringify({
    token: {
      access_token: "ya29.real-access-token",
      token_type: "Bearer",
      refresh_token: "1//refresh",
      expiry: "2026-09-21T20:01:18.880715+09:00"
    },
    auth_method: "consumer",
    id_token: "eyJhbGciOi.identity.jwt"
  });

  it("중첩된 token 객체의 access_token과 만료 시각을 꺼낸다", () => {
    const credential = parseAntigravityCredential(realShape);

    expect(credential?.accessToken).toBe("ya29.real-access-token");
    expect(credential?.expiresAtMs).toBe(Date.parse("2026-09-21T20:01:18.880715+09:00"));
  });

  it("id_token은 베어러 토큰이 아니므로 절대 쓰지 않는다", () => {
    const credential = parseAntigravityCredential(realShape);
    expect(credential?.accessToken).not.toContain("identity.jwt");

    // access_token이 없으면 id_token만 있어도 실패로 본다.
    expect(parseAntigravityCredential(JSON.stringify({ id_token: "eyJ.only.identity" }))).toBeNull();
  });

  it("최상위 access_token과 밀리초 만료도 받는다", () => {
    const credential = parseAntigravityCredential(
      JSON.stringify({ access_token: "ya29.flat", expiry_date: 1_790_000_000_000 })
    );

    expect(credential?.accessToken).toBe("ya29.flat");
    expect(credential?.expiresAtMs).toBe(1_790_000_000_000);
  });

  it("JSON이 아니면 공백 없는 값만 토큰으로 받는다", () => {
    expect(parseAntigravityCredential("ya29.bare-token")?.accessToken).toBe("ya29.bare-token");
    expect(parseAntigravityCredential("error: no credential found")).toBeNull();
  });

  it("빈 값과 토큰이 없는 객체는 거른다", () => {
    expect(parseAntigravityCredential(null)).toBeNull();
    expect(parseAntigravityCredential("   ")).toBeNull();
    expect(parseAntigravityCredential(JSON.stringify({ user: "someone" }))).toBeNull();
  });
});
