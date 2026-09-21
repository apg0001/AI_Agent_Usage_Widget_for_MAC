/**
 * Antigravity CLI replaces Gemini CLI for Google AI Pro/Ultra and free users.
 * Unlike Gemini CLI it keeps no token on disk — the official docs only say it
 * uses "your operating system's native secure keyring". The service/account
 * names below are not documented either, so every reader here treats a miss as
 * "not signed in" instead of an error.
 *
 * The stored blob nests the OAuth token one level down, alongside its expiry:
 *   { token: { access_token, token_type, refresh_token, expiry }, id_token, ... }
 * The sibling id_token is an identity JWT, not a bearer credential — sending it
 * to an API earns a 401, so it is deliberately not treated as a fallback.
 */
export const ANTIGRAVITY_KEYRING_SERVICE = "gemini";
export const ANTIGRAVITY_KEYRING_ACCOUNT = "antigravity";
export const ANTIGRAVITY_WINDOWS_TARGET = `${ANTIGRAVITY_KEYRING_SERVICE}:${ANTIGRAVITY_KEYRING_ACCOUNT}`;

export type AntigravityCredential = {
  accessToken: string;
  /** Epoch milliseconds, when the blob carried an expiry we could parse. */
  expiresAtMs?: number;
};

const ACCESS_TOKEN_KEYS = ["access_token", "accessToken"];
const EXPIRY_KEYS = ["expiry", "expires_at", "expiresAt", "expiry_date", "expiryDate"];
const MAX_BARE_TOKEN_LENGTH = 8_192;
const MAX_SEARCH_DEPTH = 4;

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readExpiryMs(record: Record<string, unknown>): number | undefined {
  for (const key of EXPIRY_KEYS) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      // Gemini-style millisecond epochs, and second epochs from other writers.
      return value < 10_000_000_000 ? value * 1_000 : value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function searchCredential(value: unknown, depth: number): AntigravityCredential | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > MAX_SEARCH_DEPTH) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const accessToken = readString(record, ACCESS_TOKEN_KEYS);
  if (accessToken) {
    return { accessToken, expiresAtMs: readExpiryMs(record) };
  }

  for (const nested of Object.values(record)) {
    const found = searchCredential(nested, depth + 1);
    if (found) {
      return found;
    }
  }
  return null;
}

export function parseAntigravityCredential(raw: string | null | undefined): AntigravityCredential | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string" && parsed.trim()) {
      return { accessToken: parsed.trim() };
    }
    return searchCredential(parsed, 0);
  } catch {
    // A bare token is the other plausible shape; anything with whitespace is
    // more likely to be a stray log line than a credential.
    return !/\s/.test(trimmed) && trimmed.length <= MAX_BARE_TOKEN_LENGTH
      ? { accessToken: trimmed }
      : null;
  }
}
