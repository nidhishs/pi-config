// OAuthClientProvider for remote MCP servers; the MCP SDK does discovery/PKCE/DCR/exchange/refresh

import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { notify } from "./config.ts";

// fixed port, one auth flow at a time; port-scan + state check if it ever collides
const CALLBACK_PORT = 19876;
const CALLBACK_URL = `http://127.0.0.1:${CALLBACK_PORT}/callback`;
const CALLBACK_TIMEOUT_MS = 300_000;

const AUTH_FILE = join(getAgentDir(), ".mcp.auth.json");
type Stored = { clientInfo?: OAuthClientInformationMixed; tokens?: OAuthTokens };

const writeAuth = (auth: Record<string, Stored>): void => writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2));
const readAuth = (): Record<string, Stored> => {
  try { return JSON.parse(readFileSync(AUTH_FILE, "utf8")); }
  catch { return {/* absent or corrupt; treat as no-creds and re-auth */}; }
};

export function createAuthProvider(server: { name: string; url: string }): OAuthClientProvider {
  let verifier: string | undefined;

  const load = (): Stored => readAuth()[server.url] ?? {};
  const save = (patch: Stored): void => {
    const auth = readAuth();
    auth[server.url] = { ...auth[server.url], ...patch };
    writeAuth(auth);
  };

  return {
    redirectUrl: CALLBACK_URL,
    clientMetadata: {
      client_name: "pi-mcp",
      redirect_uris: [CALLBACK_URL],
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
    },
    clientInformation: () => load().clientInfo,
    saveClientInformation: (info) => save({ clientInfo: info }),
    tokens: () => load().tokens, // returned even if expired -- the SDK refreshes on the server's 401
    saveTokens: (tokens) => save({ tokens }),
    codeVerifier: () => verifier!, // only called mid-flow, after saveCodeVerifier
    saveCodeVerifier: (v) => void (verifier = v),
    invalidateCredentials: () => {
      const auth = readAuth();
      delete auth[server.url];
      writeAuth(auth);
    },
    redirectToAuthorization: (url) => notify(`MCP "${server.name}" requires authorization. Open:\n\n${url.href}`),
  };
}

export function listenForCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const code = new URL(req.url ?? "/", CALLBACK_URL).searchParams.get("code");
      res.end(code ? "Authorized. You can close this tab and return to Pi." : "Missing authorization code.");
      if (!code) return;
      server.close();
      resolve(code);
    });
    server.on("error", reject);
    server.listen(CALLBACK_PORT, "127.0.0.1");
    setTimeout(() => {
      server.close();
      reject(new Error(`[pi-mcp] OAuth callback timed out after ${CALLBACK_TIMEOUT_MS/60_000}m.`));
    }, CALLBACK_TIMEOUT_MS).unref();
  });
}
