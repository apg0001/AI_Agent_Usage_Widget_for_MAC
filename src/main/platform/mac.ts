import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { PlatformAdapter } from "./types.js";

function isClaudeCredentialService(service: string) {
  return service === "Claude Code-credentials" || service.startsWith("Claude Code-credentials-");
}

function decodeClaudeCredential(raw: string) {
  try {
    return JSON.parse(raw) as { accessToken?: string; claudeAiOauth?: { accessToken?: string } };
  } catch {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(trimmed)) {
      return null;
    }
    try {
      const decoded = Buffer.from(trimmed, "hex").toString("utf8");
      return JSON.parse(decoded) as { accessToken?: string; claudeAiOauth?: { accessToken?: string } };
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

function readClaudeKeychainAccessToken() {
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
      const credentials = decodeClaudeCredential(raw);
      const token = credentials?.claudeAiOauth?.accessToken ?? credentials?.accessToken;
      if (token) {
        return token;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export const macPlatform: PlatformAdapter = {
  id: "mac",
  hideFromDock: (app) => app.dock?.hide(),
  readClaudeKeychainAccessToken
};
