import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createServer as createVite } from "vite";

const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
const port = Number(process.env.PORT ?? 4600);
if (!url || !token)
  throw new Error("Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");

const client = new Client({ name: "omni-gm-ledger-host", version: "0.1.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);

async function call<T>(name: string, args: Record<string, unknown>) {
  const result = (await client.callTool({
    name,
    arguments: args,
  })) as CallToolResult;
  if (result.isError) throw new Error(`${name}: ${JSON.stringify(result)}`);
  return { result, value: result.structuredContent as T };
}

async function preparedSession(): Promise<string> {
  await call("adventure_start", {
    name: "The Glass Causeway",
    reason: "Invented Ledger proof session",
  });
  const { value: session } = await call<{ id: string }>("session_create", {
    playedOn: "2026-01-03",
  });
  const { value: upload } = await call<{ url: string }>(
    "transcript_upload_url",
    { session: session.id },
  );
  const fixture = await readFile(
    new URL("../fixtures/session.txt", import.meta.url),
  );
  const stored = await fetch(upload.url, { method: "PUT", body: fixture });
  if (!stored.ok) throw new Error(`Upload failed: ${stored.status}`);
  await call("scenes_set", {
    session: session.id,
    scenes: [
      {
        title: "The causeway ferry",
        start: "00:00:00",
        end: "00:05:10",
        place: "Glass Causeway",
        summary: "Sera offers passage and a rumor. The gate clock is visible.",
      },
      {
        title: "The red cord",
        start: "00:07:00",
        place: "Ferry landing",
        summary: "The gatekeeper leaves a red cord.",
      },
    ],
  });
  return session.id;
}

function draftArguments(session: string) {
  const sera = {
    quote: "Mind the stones, dear. My ferry is waiting.",
    at: "00:01:10",
  };
  const clock = {
    quote: "The gate clock has four segments, one filled; you can all see it.",
    at: "00:04:00",
  };
  return {
    session,
    lastTime:
      "At dusk at the ferry landing.\nPulling forward: the broken seal, the gatekeeper's red cord.\nTicking: the river gate closes, 2/4, visible.\nAlso open: Rowan suspects Sera works for the raiders (a guess).",
    changes: [
      {
        scene: 1,
        change: {
          op: "new",
          tempKey: "sera",
          kind: "npc",
          name: "Sera Venn",
          aliases: ["Sarah Ven"],
          properties: {
            role: "Ferry keeper",
            playedAs: "Speaks softly, then snaps the last word",
          },
        },
        basis: ["npc_said"],
        sources: [sera],
        why: "Sera Venn voiced the ferry keeper; keep her voice.",
      },
      {
        scene: 1,
        change: {
          op: "new",
          tempKey: "gate",
          kind: "clock",
          name: "The river gate closes",
          properties: { segments: 4, filled: 1, visibleToPlayers: "shown" },
        },
        basis: ["narrated"],
        sources: [clock],
        why: "A visible clock the players watch.",
      },
      {
        scene: 1,
        change: {
          op: "new",
          tempKey: "seal",
          kind: "thread",
          name: "Who broke the seal?",
          properties: { whatIsOpen: "Who broke the gate seal", status: "open" },
        },
        basis: ["narrated"],
        sources: [
          { quote: "Sera Venn shows you a broken seal.", at: "00:04:00" },
        ],
        why: "A new lead the table picked up.",
      },
      {
        scene: 1,
        change: { op: "relate", type: "involves", from: "$seal", to: "$sera" },
        basis: ["narrated"],
        sources: [
          { quote: "Sera Venn shows you a broken seal.", at: "00:04:00" },
        ],
        why: "Sera brought the seal to the party.",
      },
      {
        scene: 1,
        change: {
          op: "new",
          tempKey: "raiders",
          kind: "thread",
          name: "Does Sera work for the raiders?",
          properties: { status: "open" },
        },
        basis: ["player_guess"],
        sources: [
          { quote: "I bet she works for the raiders.", at: "00:02:20" },
        ],
        why: "Rowan's suspicion, kept as a guess.",
      },
      {
        scene: 2,
        change: {
          op: "update",
          entity: "$gate",
          properties: { filled: 2 },
        },
        basis: ["narrated"],
        sources: [{ quote: "You are still here at dusk.", at: "00:07:00" }],
        why: "Dusk passed at the landing; the gate clock ticks.",
      },
      {
        scene: 2,
        change: {
          op: "update",
          entity: "$seal",
          properties: { nextStep: "Ask the gatekeeper about the seal" },
        },
        basis: ["player_plan"],
        sources: [
          {
            quote: "I want to ask the gatekeeper about that seal tomorrow.",
            at: "00:05:10",
          },
        ],
        why: "The party's plan for next session.",
      },
    ],
  };
}

const session = await preparedSession();
const args = draftArguments(session);
const seeded = { arguments: args, ...(await call("debrief_add", args)) };
console.log(`Seeded draft debrief for session ${session}`);

async function body(req: IncomingMessage): Promise<string> {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text;
}
type Proxied =
  | { method: "tools/list" }
  | { method: "resources/read"; params: Parameters<Client["readResource"]>[0] }
  | { method: "tools/call"; params: Parameters<Client["callTool"]>[0] };
async function proxy(request: Proxied): Promise<unknown> {
  if (request.method === "tools/list") return client.listTools();
  if (request.method === "resources/read")
    return client.readResource(request.params);
  if (request.method === "tools/call") return client.callTool(request.params);
  throw new Error("Unsupported method");
}

const vite = await createVite({
  root: new URL("ledger-host", import.meta.url).pathname,
  server: { middlewareMode: true },
  appType: "spa",
  logLevel: "warn",
});
createServer(async (req, res) => {
  try {
    if (req.url === "/host/draft") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ arguments: seeded.arguments, result: seeded.result }),
      );
      return;
    }
    if (req.url === "/host/mcp" && req.method === "POST") {
      const request: Proxied = JSON.parse(await body(req));
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(await proxy(request)));
      return;
    }
    vite.middlewares(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.end(error instanceof Error ? error.message : String(error));
  }
}).listen(port, () => {
  console.log(`Local MCP Apps host on http://localhost:${port}/`);
});
