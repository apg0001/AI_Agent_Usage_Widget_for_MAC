import { shell } from "electron";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
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

function createCallbackServer(expectedState: string) {
  let redirectUri = "";
  const callbackPromise = new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const code = requestUrl.searchParams.get("code");
      const state = requestUrl.searchParams.get("state");
      const error = requestUrl.searchParams.get("error");

      if (error) {
        response.end("로그인이 취소되었습니다. 이 창을 닫아도 됩니다.");
        server.close();
        reject(new Error(error));
        return;
      }

      if (!code || state !== expectedState) {
        response.statusCode = 400;
        response.end("OAuth callback 상태가 올바르지 않습니다.");
        return;
      }

      response.end("AI Usage Widget 로그인 완료. 이 창을 닫아도 됩니다.");
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

async function exchangeGeminiCode(code: string, redirectUri: string, clientId: string, clientSecret: string) {
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
    throw new Error(`Google OAuth 토큰 교환 실패: ${response.status}`);
  }

  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
}

async function startGeminiOAuth(): Promise<OAuthLoginResult> {
  const { clientId, clientSecret } = getGeminiOAuthConfig();

  if (!clientId || !clientSecret) {
    return {
      provider: "gemini",
      status: "missing-config",
      message: "GEMINI_OAUTH_CLIENT_ID와 GEMINI_OAUTH_CLIENT_SECRET 설정이 필요합니다."
    };
  }

  try {
    const state = randomBytes(20).toString("hex");
    const { redirectUri, callbackPromise } = await createCallbackServer(state);
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
    const token = await exchangeGeminiCode(callback.code, callback.redirectUri, clientId, clientSecret);
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
      message: "Gemini OAuth 로그인이 완료되었습니다."
    };
  } catch (error) {
    return {
      provider: "gemini",
      status: "error",
      message: error instanceof Error ? error.message : "Gemini OAuth 로그인에 실패했습니다."
    };
  }
}

export async function startOAuthLogin(provider: ProviderId): Promise<OAuthLoginResult> {
  if (provider === "gemini") {
    return startGeminiOAuth();
  }

  return {
    provider,
    status: "unsupported",
    message:
      provider === "codex"
        ? "Codex/OpenAI 개인 사용량 조회용 OAuth API는 아직 앱 설정에 연결되지 않았습니다."
        : "Claude 개인 사용량 조회용 OAuth는 현재 앱에서 지원하지 않습니다. Admin API 키 방식 검토가 필요합니다."
  };
}
