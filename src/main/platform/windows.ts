import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { getLoginItemLaunchAtLogin, setLoginItemLaunchAtLogin } from "./loginItem.js";
import { ANTIGRAVITY_WINDOWS_TARGET, parseAntigravityToken } from "./antigravityCredential.js";
import { PlatformAdapter } from "./types.js";

const KEYRING_READ_INTERVAL_MS = 60_000;
const KEYRING_READ_TIMEOUT_MS = 5_000;

// cmdkey lists generic credentials under a LegacyGeneric prefix, but CredRead
// wants the raw target for entries written through the plain API. Try both.
const ANTIGRAVITY_TARGETS = [
  ANTIGRAVITY_WINDOWS_TARGET,
  `LegacyGeneric:target=${ANTIGRAVITY_WINDOWS_TARGET}`
];

let antigravityTokenCache: { expiresAt: number; value: string | null } = { expiresAt: 0, value: null };

/**
 * Credential Manager has no CLI that prints a secret (cmdkey only lists target
 * names), so read the blob through CredRead and hand the raw bytes back as
 * base64. The script is passed as -EncodedCommand to keep quoting out of it.
 */
function credentialReadScript(target: string) {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class CredNative {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public uint Flags;
    public uint Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
  }
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredReadW(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32.dll")]
  public static extern void CredFree(IntPtr buffer);
}
"@
$handle = [IntPtr]::Zero
if (-not [CredNative]::CredReadW('${target.replace(/'/g, "''")}', 1, 0, [ref]$handle)) { exit 1 }
try {
  $cred = [System.Runtime.InteropServices.Marshal]::PtrToStructure($handle, [Type][CredNative+CREDENTIAL])
  if ($cred.CredentialBlobSize -le 0) { exit 1 }
  $bytes = New-Object byte[] $cred.CredentialBlobSize
  [System.Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize)
  [Convert]::ToBase64String($bytes)
} finally {
  [CredNative]::CredFree($handle)
}
`;
}

function readCredentialBlob(target: string): Buffer | null {
  try {
    const encoded = Buffer.from(credentialReadScript(target), "utf16le").toString("base64");
    const output = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: KEYRING_READ_TIMEOUT_MS }
    ).trim();
    return output ? Buffer.from(output, "base64") : null;
  } catch {
    return null;
  }
}

function readAntigravityKeyringToken(): string | null {
  if (Date.now() < antigravityTokenCache.expiresAt) {
    return antigravityTokenCache.value;
  }

  let token: string | null = null;
  for (const target of ANTIGRAVITY_TARGETS) {
    const blob = readCredentialBlob(target);
    if (!blob) {
      continue;
    }
    // The blob's encoding is undocumented; UTF-8 is the common case and
    // Credential Manager's own tooling writes UTF-16LE.
    token = parseAntigravityToken(blob.toString("utf8")) ?? parseAntigravityToken(blob.toString("utf16le"));
    if (token) {
      break;
    }
  }

  antigravityTokenCache = { expiresAt: Date.now() + KEYRING_READ_INTERVAL_MS, value: token };
  return token;
}

export const windowsPlatform: PlatformAdapter = {
  id: "windows",
  hideFromDock: () => undefined,
  readClaudeKeychainCredential: () => null,
  writeClaudeKeychainCredential: () => false,
  readAntigravityKeyringToken,
  getLaunchAtLogin: getLoginItemLaunchAtLogin,
  setLaunchAtLogin: setLoginItemLaunchAtLogin
};
