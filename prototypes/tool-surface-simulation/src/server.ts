// PROTOTYPE — throwaway. Fake Omni-GM MCP server over stdio. In-memory store, one surface per process.
// Env: SURFACE=A|B|C|D, STATE=<json file, loaded at start and rewritten after every call>,
//      LOG=<jsonl file of every call>, UPLOAD_MODE=signed|page.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Rejection, Store } from "./domain";
import { PROCEDURES, STANDING_RULES, allProceduresText } from "./procedures";
import { toolsFor, type Surface } from "./surfaces";

const surface = (process.env.SURFACE ?? "C") as Surface;
const statePath = process.env.STATE!;
const logPath = process.env.LOG!;
const uploadMode = (process.env.UPLOAD_MODE ?? "signed") as "signed" | "page";

const store = new Store(JSON.parse(readFileSync(statePath, "utf8")));
const save = () => writeFileSync(statePath, JSON.stringify(store.state, null, 1));
const log = (entry: Record<string, unknown>) => appendFileSync(logPath, JSON.stringify({ t: Date.now(), surface, ...entry }) + "\n");

const http = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    const signed = url.pathname.match(/^\/u\/([a-f0-9]+)$/);
    if (signed && (req.method === "PUT" || req.method === "POST")) {
      const sessionId = store.state.uploads[signed[1]!];
      if (!sessionId) return new Response("Unknown or expired upload token.\n", { status: 403 });
      const body = await req.text();
      store.attachTranscript(sessionId, body, "signed-url");
      delete store.state.uploads[signed[1]!];
      save();
      log({ event: "upload", via: "signed-url", sessionId, bytes: Buffer.byteLength(body) });
      return new Response(`Stored ${Buffer.byteLength(body)} bytes for ${sessionId}.\n`);
    }
    if (url.pathname.startsWith("/upload/")) {
      log({ event: "upload-page-visit", method: req.method });
      return new Response("<html><body><h1>Sign in to Omni-GM</h1><p>Sign in with your account to upload a transcript.</p></body></html>", {
        status: 401,
        headers: { "content-type": "text/html" },
      });
    }
    return new Response("Not found\n", { status: 404 });
  },
});

const upload = {
  mode: uploadMode,
  urlFor: (sessionId: string) => {
    if (uploadMode === "page") return `http://127.0.0.1:${http.port}/upload/${sessionId}`;
    const token = randomBytes(12).toString("hex");
    store.state.uploads[token] = sessionId;
    return `http://127.0.0.1:${http.port}/u/${token}`;
  },
};

const tools = toolsFor(surface);
const usesPrompts = surface === "A" || surface === "B";
const instructions = {
  A: `${STANDING_RULES}\nThe procedures (debrief, frame talk, prep sparring, ...) are available as MCP prompts.`,
  B: `${STANDING_RULES}\nThe procedures (debrief, frame talk, prep sparring, ...) are available as MCP prompts.`,
  C: `${STANDING_RULES}\nBefore any workflow, load its procedure with the skill tool.`,
  D: `${STANDING_RULES}\n\nFollow the matching procedure for each workflow.\n\n${allProceduresText()}`,
}[surface];

const server = new Server({ name: "omni-gm", version: "0.0.1-prototype" }, { capabilities: { tools: {}, ...(usesPrompts ? { prompts: {} } : {}) }, instructions });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => {
    const { $schema, ...inputSchema } = z.toJSONSchema(t.schema) as Record<string, unknown>;
    return { name: t.name, description: t.description, inputSchema, annotations: { readOnlyHint: !t.write } };
  }),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const t = tools.find((x) => x.name === req.params.name);
  const args = req.params.arguments ?? {};
  const argsBytes = JSON.stringify(args).length;
  const reply = (payload: unknown, isError = false) => {
    const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 1);
    return { content: [{ type: "text" as const, text }], isError, resultBytes: text.length };
  };
  if (!t) {
    log({ tool: req.params.name, args, argsBytes, outcome: "unknown_tool" });
    return reply(`Unknown tool ${req.params.name}.`, true);
  }
  const parsed = t.schema.safeParse(args);
  if (!parsed.success) {
    const message = `Invalid input: ${z.prettifyError(parsed.error)}`;
    log({ tool: t.name, args, argsBytes, outcome: "invalid", error: message });
    return reply(message, true);
  }
  try {
    const result = t.run(parsed.data, { store, upload });
    save();
    const partial = JSON.stringify(result).match(/"accepted":false/g)?.length ?? 0;
    const r = reply(result);
    log({ tool: t.name, args, argsBytes, outcome: "ok", partialRejections: partial, resultBytes: r.resultBytes, errors: partial ? collectErrors(result) : undefined });
    return { content: r.content };
  } catch (e) {
    if (!(e instanceof Rejection)) throw e;
    log({ tool: t.name, args, argsBytes, outcome: "rejected", error: e.message });
    return reply(e.message, true);
  }
});

function collectErrors(result: unknown) {
  return JSON.stringify(result).match(/"error":"[^"]*"/g);
}

if (usesPrompts) {
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: Object.entries(PROCEDURES).map(([name, p]) => ({ name, description: p.summary })),
  }));
  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    log({ event: "prompt", name: req.params.name });
    const p = PROCEDURES[req.params.name];
    return { messages: [{ role: "user", content: { type: "text", text: p?.body ?? "No such prompt." } }] };
  });
}

log({ event: "start", tools: tools.length, uploadMode });
await server.connect(new StdioServerTransport());
