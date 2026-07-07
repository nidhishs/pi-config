// connection registry: connect-on-first-call, idempotent teardown

import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createAuthProvider, listenForCode } from "./oauth.ts";
import type { ServerConfig } from "./config.ts";

const CLIENT_INFO = { name: "pi-mcp", version: "n/a" };
const clients = new Map<string, Promise<Client>>();

export function getClient(cfg: ServerConfig): Promise<Client> {
  const cached = clients.get(cfg.name);
  if (cached) return cached;
  const client = connect(cfg);
  // evict on failed connect or on later close/crash, so the next call reconnects;
  const evict = () => void (clients.get(cfg.name) === client && clients.delete(cfg.name));
  client.then((c) => (c.onclose = evict), evict);
  clients.set(cfg.name, client);
  return client;
}

export async function closeClients(): Promise<void> {
  const pending = [...clients.values()];
  clients.clear();
  await Promise.allSettled(pending.map(async (p) => (await p).close()));
}

function connect(cfg: ServerConfig): Promise<Client> {
  switch (cfg.type) {
    case "stdio":
      return connectStdio(cfg);
    case "http":
      return connectHttp(cfg);
    default:
      throw new Error(`[pi-mcp] unsupported transport: ${(cfg as ServerConfig).type}`);
  }
}

async function open(transport: Transport): Promise<Client> {
  const client = new Client(CLIENT_INFO);
  await client.connect(transport);
  return client;
}

function connectStdio(cfg: Extract<ServerConfig, { type: "stdio" }>): Promise<Client> {
  return open(new StdioClientTransport({
    command: cfg.command, args: cfg.args, env: cfg.env, stderr: "ignore"
  }));
}

async function connectHttp(cfg: Extract<ServerConfig, { type: "http" }>): Promise<Client> {
  const url = new URL(cfg.url);
  const opts = { authProvider: createAuthProvider(cfg), requestInit: cfg.headers ? { headers: cfg.headers } : undefined };

  const first = new StreamableHTTPClientTransport(url, opts);
  try {
    return await open(first);
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) throw err;
    await first.finishAuth(await listenForCode());
  }
  return open(new StreamableHTTPClientTransport(url, opts)); // authorized now
}
