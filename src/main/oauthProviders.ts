import { shell } from "electron";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { getTranslations, Language } from "../shared/i18n.js";
import { OAuthLoginResult, ProviderId } from "../shared/types.js";
import { setProviderOAuth } from "./settingsStore.js";

const GEMINI_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/generative-language.retriever"
];

function getGeminiOAuthConfig() {
  return {
    clientId: process.env.GEMINI_OAUTH_CLIENT_ID,
    clientSecret: process.env.GEMINI_OAUTH_CLIENT_SECRET
  };
}

function createCallbackServer(expectedState: string, language: Language) {
  const t = getTranslations(language);
  let redirectUri = "";
  const callbackPromise = new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const code = requestUrl.searchParams.get("code");
      const state = requestUrl.searchParams.get("state");
      const error = requestUrl.searchParams.get("error");

      if (error) {
        response.end(t.oauth.loginCancelled);
        server.close();
        reject(new Error(error));
        return;
      }

      if (!code || state !== expectedState) {
        response.statusCode = 400;
        response.end(t.oauth.callbackStateInvalid);
        return;
      }

      response.end(t.oauth.loginComplete);
      server.close();
      resolve({ code, redirectUri });
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      redirectUri = `http://127.0.0.1:${port}/oauth/gemini/callback`;
    });
  });

  return new Promise<{ redirectUri: string; callbackPromise: Promise<{ code: string; redirectUri: string }> }>(
    (resolve) => {
      const interval = setInterval(() => {
        if (redirectUri) {
          clearInterval(interval);
          resolve({ redirectUri, callbackPromise });
        }
      }, 10);
    }
  );
}

async function exchangeGeminiCode(code: string, redirectUri: string, clientId: string, clientSecret: string, language: Language) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });

  if (!response.ok) {
    throw new Error(getTranslations(language).oauth.googleTokenExchangeFailed(response.status));
  }

  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
}

async function startGeminiOAuth(language: Language): Promise<OAuthLoginResult> {
  const t = getTranslations(language);
  const { clientId, clientSecret } = getGeminiOAuthConfig();

  if (!clientId || !clientSecret) {
    return {
      provider: "gemini",
      status: "missing-config",
      message: t.oauth.geminiMissingConfig
    };
  }

  try {
    const state = randomBytes(20).toString("hex");
    const { redirectUri, callbackPromise } = await createCallbackServer(state, language);
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GEMINI_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state
    }).toString();

    void shell.openExternal(authUrl.toString());
    const callback = await callbackPromise;
    const token = await exchangeGeminiCode(callback.code, callback.redirectUri, clientId, clientSecret, language);
    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : undefined;

    setProviderOAuth("gemini", {
      type: "oauth",
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
      accountLabel: "Google OAuth"
    });

    return {
      provider: "gemini",
      status: "success",
      message: t.oauth.geminiLoginSuccess
    };
  } catch (error) {
    return {
      provider: "gemini",
      status: "error",
      message: error instanceof Error ? error.message : t.oauth.geminiLoginFailedGeneric
    };
  }
}

export async function startOAuthLogin(provider: ProviderId, language: Language = "ko"): Promise<OAuthLoginResult> {
  if (provider === "gemini") {
    return startGeminiOAuth(language);
  }

  const t = getTranslations(language);
  return {
    provider,
    status: "unsupported",
    message: provider === "codex" ? t.oauth.codexOAuthUnsupported : t.oauth.claudeOAuthUnsupported
  };
}
