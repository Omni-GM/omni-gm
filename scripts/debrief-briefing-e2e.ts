import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const step = process.argv[2];
assert(
  step === "seed" || step === "correct",
  "Run with seed before the debrief or correct after its commit",
);
const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "omni-gm-debrief-briefing", version: "1" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
console.log(`PROOF TARGET ${new URL(url).origin}`);

async function call<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const result = (await client.callTool({
    name,
    arguments: args,
  })) as CallToolResult;
  assert(!result.isError && result.structuredContent, `${name} failed`);
  return result.structuredContent as T;
}

async function seedPlayedSession() {
  const overview = await call<{ value: { sessions: unknown[] } }>("get", {
    ref: "overview",
  }).catch(() => null);
  assert(!overview?.value.sessions.length, "Seed a fresh preview only");
  await call("adventure_start", {
    name: "Brackwater",
    reason: "Invented debrief briefing proof",
  });
  const session = await call<{ id: string }>("session_create", {
    playedOn: "2026-03-14",
  });
  const upload = await call<{ url: string }>("transcript_upload_url", {
    session: session.id,
  });
  const transcript = await readFile(
    new URL("../fixtures/debrief-briefing-session.txt", import.meta.url),
  );
  assert.equal(
    (await fetch(upload.url, { method: "PUT", body: transcript })).status,
    200,
  );
  const stored = await call<{ value: { utterances: unknown[] } }>("get", {
    ref: `transcript:${session.id}`,
  });
  assert.equal(stored.value.utterances.length, 30);
  console.log(
    `PASS seeded session ${session.id} with the invented 30-line transcript, no scenes and no draft`,
  );
}

async function correctAfterCommit() {
  const warden = await call<{ hits: { ref: string }[] }>("find", {
    query: "Calloway",
    types: ["entity"],
  });
  assert(warden.hits.length > 0, "The debrief recorded Warden Calloway");
  const reason = "Store correction: Calloway's garrison sits at Gull Point";
  const { commit } = await call<{ commit: string }>("story_commit", {
    reason,
    changes: [
      {
        change: {
          op: "update",
          entity: warden.hits[0].ref.replace(/^entity:/, ""),
          properties: { knows: "Her garrison sits at Gull Point" },
        },
        basis: ["game_master"],
        sources: [{ quote: "Calloway's garrison is out at Gull Point." }],
        why: "The game master corrected the store after the debrief",
      },
    ],
  });
  console.log(`PASS story commit ${commit} written after the debrief`);
  console.log(`CORRECTION ${JSON.stringify({ commit, reason })}`);
}

try {
  if (step === "seed") await seedPlayedSession();
  else await correctAfterCommit();
} finally {
  await client.close();
}
