import { UpdateDiagnosticCode, UpdateErrorCode } from "../shared/types.js";

export type NormalizedUpdateError = {
  errorCode: UpdateErrorCode;
  diagnosticCode: UpdateDiagnosticCode;
};

type ErrorLike = {
  code?: unknown;
  statusCode?: unknown;
  message?: unknown;
  name?: unknown;
  cause?: unknown;
};

function classificationText(error: unknown, depth = 0): string {
  if (depth > 2 || error == null) {
    return "";
  }

  if (typeof error !== "object") {
    return String(error);
  }

  const candidate = error as ErrorLike;
  return [
    candidate.code,
    candidate.statusCode,
    candidate.name,
    candidate.message,
    classificationText(candidate.cause, depth + 1)
  ].filter((value) => value != null).join(" ");
}

export function normalizeUpdateError(error: unknown): NormalizedUpdateError {
  const text = classificationText(error);

  if (
    /ERR_UPDATER_CHANNEL_FILE_NOT_FOUND/i.test(text) ||
    (/latest(?:-[\w]+)?\.ya?ml/i.test(text) && /(?:404|not found|cannot find)/i.test(text))
  ) {
    return {
      errorCode: "metadata-missing",
      diagnosticCode: "UPDATE_METADATA_MISSING"
    };
  }

  if (/(?:HTTP_ERROR_(?:401|403)|\b(?:401|403)\b|EACCES|EPERM|unauthori[sz]ed|forbidden|permission denied)/i.test(text)) {
    return {
      errorCode: "access-denied",
      diagnosticCode: "UPDATE_ACCESS_DENIED"
    };
  }

  if (/(?:ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|net::ERR_|ERR_(?:NETWORK|INTERNET)|network|offline|socket hang up)/i.test(text)) {
    return {
      errorCode: "network",
      diagnosticCode: "UPDATE_NETWORK"
    };
  }

  if (/ERR_UPDATER_LATEST_VERSION_NOT_FOUND/i.test(text)) {
    return {
      errorCode: "metadata-missing",
      diagnosticCode: "UPDATE_METADATA_MISSING"
    };
  }

  if (/(?:sha512|checksum|signature|integrity|digest mismatch)/i.test(text)) {
    return {
      errorCode: "invalid-release",
      diagnosticCode: "UPDATE_INTEGRITY"
    };
  }

  return {
    errorCode: "unknown",
    diagnosticCode: "UPDATE_UNKNOWN"
  };
}
