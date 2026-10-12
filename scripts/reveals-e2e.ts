import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const secrets: Record<string, string> = JSON.parse(
  await readFile(
    new URL("../fixtures/reveals-secrets.json", import.meta.url),
    "utf8",
  ),
);

const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "omni-gm-reveals-seed", version: "1" });
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

try {
  const overview = await call<{ value: { sessions: unknown[] } }>("get", {
    ref: "overview",
  }).catch(() => null);
  assert(!overview?.value.sessions.length, "Seed a fresh preview only");
  await call("adventure_start", {
    name: "Thornwick",
    reason: "Invented reveal proof",
  });
  const session = await call<{ id: string }>("session_create", {
    playedOn: "2026-05-09",
  });
  const upload = await call<{ url: string }>("transcript_upload_url", {
    session: session.id,
  });
  const transcript = await readFile(
    new URL("../fixtures/reveals-session.txt", import.meta.url),
  );
  assert.equal(
    (await fetch(upload.url, { method: "PUT", body: transcript })).status,
    200,
  );
  const stored = await call<{ value: { utterances: unknown[] } }>("get", {
    ref: `transcript:${session.id}`,
  });
  assert.equal(stored.value.utterances.length, 24);
  const ids: Record<string, string> = {};
  for (const [key, text] of Object.entries(secrets))
    ids[key] = (
      await call<{ secret: { id: string } }>("secret_write", {
        op: "write",
        text,
        reason: "Unplayed background before the session",
      })
    ).secret.id;
  console.log(
    `PASS seeded session ${session.id} with the invented 24-line transcript and three hidden secrets`,
  );
  console.log(`SECRETS ${JSON.stringify(ids)}`);
} finally {
  await client.close();
}
