import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { closeClients } from "./client.ts";
import { loadConfig, setNotify } from "./config.ts";
import { registerDirectTools, registerProxyTool } from "./tools.ts";

// Clients are cached at module scope and may be shared by concurrent AgentSessions;
// Close them only after the last session using this extension ends.
let activeSessions = 0;

export default function (pi: ExtensionAPI) {
  // Read config after trust resolution (session_start runs after Pi resolves project trust)
  pi.on("session_start", async (_event, ctx) => {
    activeSessions += 1;
    if (ctx.hasUI) setNotify(ctx.ui.notify);

    const servers = loadConfig(ctx.cwd, ctx.isProjectTrusted());
    if (servers.length === 0) return; // no servers, no tools -- zero context cost

    registerProxyTool(pi, servers);
    await registerDirectTools(pi, servers);
  });
  pi.on("session_shutdown", async () => {
    activeSessions -= 1;
    if (activeSessions === 0) await closeClients();
  });
}
