import { describe, expect, it } from "vitest";
import { normalizeUpdateError } from "../../src/main/updateError";

describe("업데이트 오류 정규화", () => {
  it("latest.yml 404를 짧은 메타데이터 오류로 바꾸고 스택과 헤더를 숨긴다", () => {
    const error = new Error(
      "Cannot find latest.yml in the latest release (https://github.com/example/releases/latest): " +
      "HttpError: 404 Headers: { authorization: secret-token }\n" +
      "    at ElectronHttpExecutor.handleResponse (C:\\Users\\USER\\AppData\\app.js:57:2)"
    );

    const normalized = normalizeUpdateError(error);

    expect(normalized).toEqual({
      errorCode: "metadata-missing",
      diagnosticCode: "UPDATE_METADATA_MISSING"
    });
    expect(JSON.stringify(normalized)).not.toContain("secret-token");
    expect(JSON.stringify(normalized)).not.toContain("AppData");
  });

  it.each([
    ["request failed: ETIMEDOUT", "network", "UPDATE_NETWORK"],
    ["HttpError: 403 forbidden", "access-denied", "UPDATE_ACCESS_DENIED"],
    ["sha512 checksum mismatch", "invalid-release", "UPDATE_INTEGRITY"]
  ] as const)("%s 오류를 %s 상태로 분류한다", (message, errorCode, diagnosticCode) => {
    expect(normalizeUpdateError(new Error(message))).toEqual({ errorCode, diagnosticCode });
  });

  it("알 수 없는 오류의 원문과 민감한 값은 공개 상태에 포함하지 않는다", () => {
    const normalized = normalizeUpdateError(
      new Error("Unexpected token=super-secret C:\\Users\\USER\\private\\file.txt\n    at internal.call (app.js:1:1)")
    );

    expect(normalized).toEqual({
      errorCode: "unknown",
      diagnosticCode: "UPDATE_UNKNOWN"
    });
    const serialized = JSON.stringify(normalized);
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("C:\\Users");
    expect(serialized).not.toContain("internal.call");
  });

  it("구조화된 electron-updater 오류 코드를 문자열 메시지보다 먼저 분류한다", () => {
    const error = Object.assign(new Error("wrapped failure"), {
      code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND"
    });

    expect(normalizeUpdateError(error)).toEqual({
      errorCode: "metadata-missing",
      diagnosticCode: "UPDATE_METADATA_MISSING"
    });
  });

  it("latest-version wrapper 안의 접근·네트워크 원인을 metadata보다 우선한다", () => {
    const accessError = Object.assign(new Error("HTTP_ERROR_403"), {
      code: "ERR_UPDATER_LATEST_VERSION_NOT_FOUND"
    });
    const networkError = Object.assign(new Error("cause: ENOTFOUND"), {
      code: "ERR_UPDATER_LATEST_VERSION_NOT_FOUND"
    });

    expect(normalizeUpdateError(accessError).errorCode).toBe("access-denied");
    expect(normalizeUpdateError(networkError).errorCode).toBe("network");
  });
});
