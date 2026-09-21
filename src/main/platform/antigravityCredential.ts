/**
 * Antigravity CLI replaces Gemini CLI for Google AI Pro/Ultra and free users.
 * Unlike Gemini CLI it keeps no token on disk — the official docs only say it
 * uses "your operating system's native secure keyring". The service/account
 * names below come from community reports rather than documentation, and the
 * stored blob's shape is not documented either, so every reader here treats a
 * miss as "not signed in" instead of an error.
 */
export const ANTIGRAVITY_KEYRING_SERVICE = "gemini";
export const ANTIGRAVITY_KEYRING_ACCOUNT = "antigravity";
export const ANTIGRAVITY_WINDOWS_TARGET = `${ANTIGRAVITY_KEYRING_SERVICE}:${ANTIGRAVITY_KEYRING_ACCOUNT}`;

const TOKEN_KEYS = ["access_token", "accessToken", "token", "id_token"];
const MAX_BARE_TOKEN_LENGTH = 8_192;

function pickTokenFromRecord(record: Record<string, unknown>): string | null {
  for (const key of TOKEN_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = pickTokenFromRecord(value as Record<string, unknown>);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

export function parseAntigravityToken(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "string" && parsed.trim()) {
      return parsed.trim();
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return pickTokenFromRecord(parsed as Record<string, unknown>);
    }
    return null;
  } catch {
    // A bare token is the other plausible shape; anything with whitespace is
    // more likely to be a stray log line than a credential.
    return !/\s/.test(trimmed) && trimmed.length <= MAX_BARE_TOKEN_LENGTH ? trimmed : null;
  }
}
