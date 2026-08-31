import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { getLoginItemLaunchAtLogin, setLoginItemLaunchAtLogin } from "./loginItem.js";
import { ClaudeCredential, ClaudeCredentialUpdate, PlatformAdapter } from "./types.js";

const KEYCHAIN_READ_INTERVAL_MS = 60_000;

type ClaudeKeychainEnvelope = {
  accessToken?: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: number | string;
  organizationUuid?: string;
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    refreshTokenExpiresAt?: number | string;
    expiresAt?: number | string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type KeychainItem = { account: string; service: string };
type DecodedCredential = { envelope: ClaudeKeychainEnvelope; encoding: "json" | "hex" };

let keychainCredentialCache: {
  expiresAt: number;
  value: ClaudeCredential | null;
  source: (KeychainItem & { encoding: "json" | "hex" }) | null;
} = {
  expiresAt: 0,
  value: null,
  source: null
};

function isClaudeCredentialService(service: string) {
  return service === "Claude Code-credentials" || service.startsWith("Claude Code-credentials-");
}

function decodeClaudeCredential(raw: string): DecodedCredential | null {
  try {
    return { envelope: JSON.parse(raw) as ClaudeKeychainEnvelope, encoding: "json" };
  } catch {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(trimmed)) {
      return null;
    }
    try {
      const decoded = Buffer.from(trimmed, "hex").toString("utf8");
      return { envelope: JSON.parse(decoded) as ClaudeKeychainEnvelope, encoding: "hex" };
    } catch {
      return null;
    }
  }
}

function listClaudeKeychainItems() {
  try {
    const dump = execFileSync("/usr/bin/security", ["dump-keychain"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000
    });
    const items: Array<{ account: string; service: string }> = [];
    let account = "";
    for (const line of dump.split("\n")) {
      const accountMatch = line.match(/"acct"<blob>="([^"]+)"/);
      if (accountMatch) {
        account = accountMatch[1];
      }
      const serviceMatch = line.match(/"svce"<blob>="([^"]+)"/);
      if (serviceMatch && account && isClaudeCredentialService(serviceMatch[1])) {
        items.push({ account, service: serviceMatch[1] });
      }
    }
    return items.sort((a, b) => {
      const serviceRank = (item: { service: string }) => (item.service === "Claude Code-credentials" ? 0 : 1);
      const accountRank = (item: { account: string }) => (item.account === process.env.USER ? 0 : 1);
      return serviceRank(a) - serviceRank(b) || accountRank(a) - accountRank(b) || a.account.localeCompare(b.account);
    });
  } catch {
    return [];
  }
}

function readClaudeKeychainCredential(): ClaudeCredential | null {
  if (Date.now() < keychainCredentialCache.expiresAt) {
    return keychainCredentialCache.value;
  }

  for (const item of listClaudeKeychainItems()) {
    try {
      const raw = execFileSync(
        "/usr/bin/security",
        ["find-generic-password", "-s", item.service, "-a", item.account, "-w"],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 3_000
        }
      ).trim();
      const decoded = decodeClaudeCredential(raw);
      const token = decoded?.envelope.claudeAiOauth?.accessToken ?? decoded?.envelope.accessToken;
      if (decoded && token) {
        const value = {
          accessToken: token,
          refreshToken: decoded.envelope.claudeAiOauth?.refreshToken ?? decoded.envelope.refreshToken,
          refreshTokenExpiresAt:
            decoded.envelope.claudeAiOauth?.refreshTokenExpiresAt ?? decoded.envelope.refreshTokenExpiresAt,
          organizationUuid: decoded.envelope.organizationUuid
        };
        keychainCredentialCache = {
          expiresAt: Date.now() + KEYCHAIN_READ_INTERVAL_MS,
          value,
          source: { account: item.account, service: item.service, encoding: decoded.encoding }
        };
        return value;
      }
    } catch {
      continue;
    }
  }

  keychainCredentialCache = {
    expiresAt: Date.now() + KEYCHAIN_READ_INTERVAL_MS,
    value: null,
    source: null
  };
  return null;
}

function writeToKeychainItem(item: KeychainItem, update: ClaudeCredentialUpdate) {
  const raw = execFileSync(
    "/usr/bin/security",
    ["find-generic-password", "-s", item.service, "-a", item.account, "-w"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3_000 }
  ).trim();
  const decoded = decodeClaudeCredential(raw);
  if (!decoded) {
    return false;
  }
  const { envelope, encoding } = decoded;
  const hasToken = envelope.claudeAiOauth?.accessToken ?? envelope.accessToken;
  if (!hasToken) {
    return false;
  }

  if (envelope.claudeAiOauth) {
    envelope.claudeAiOauth.accessToken = update.accessToken;
    envelope.claudeAiOauth.refreshToken = update.refreshToken;
    if (update.expiresAt !== undefined) {
      envelope.claudeAiOauth.expiresAt = update.expiresAt;
    }
  } else {
    envelope.accessToken = update.accessToken;
    envelope.refreshToken = update.refreshToken;
    if (update.expiresAt !== undefined) {
      envelope.expiresAt = update.expiresAt;
    }
  }

  const serialized = JSON.stringify(envelope);
  const payload = encoding === "hex" ? Buffer.from(serialized, "utf8").toString("hex") : serialized;

  execFileSync(
    "/usr/bin/security",
    ["add-generic-password", "-U", "-s", item.service, "-a", item.account, "-w", payload],
    { stdio: ["ignore", "ignore", "ignore"], timeout: 3_000 }
  );
  return true;
}

function writeClaudeKeychainCredential(update: ClaudeCredentialUpdate): boolean {
  const cachedSource = keychainCredentialCache.source;
  const candidates: KeychainItem[] = cachedSource
    ? [{ account: cachedSource.account, service: cachedSource.service }, ...listClaudeKeychainItems()]
    : listClaudeKeychainItems();

  for (const item of candidates) {
    try {
      if (writeToKeychainItem(item, update)) {
        keychainCredentialCache = { expiresAt: 0, value: null, source: null };
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

export const macPlatform: PlatformAdapter = {
  id: "mac",
  hideFromDock: (app) => app.dock?.hide(),
  readClaudeKeychainCredential,
  writeClaudeKeychainCredential,
  getLaunchAtLogin: getLoginItemLaunchAtLogin,
  setLaunchAtLogin: setLoginItemLaunchAtLogin
};
