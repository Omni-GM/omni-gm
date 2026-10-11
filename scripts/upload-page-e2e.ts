import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
if (!url || !token)
  throw new Error("Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const [command, session, file] = process.argv.slice(2);
const client = new Client({ name: "omni-gm-upload-proof", version: "1.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);

async function call<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const result = (await client.callTool({
    name,
    arguments: args,
  })) as CallToolResult;
  assert(!result.isError, `Tool ${name} failed`);
  return result.structuredContent as T;
}

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

async function createSession(): Promise<void> {
  await call("adventure_start", {
    name: "The Glass Causeway",
    reason: "Upload page proof",
  });
  const created = await call<{ id: string }>("session_create", {
    playedOn: "2026-01-03",
  });
  const links = await call<{ url: string; pageUrl: string }>(
    "transcript_upload_url",
    { session: created.id },
  );
  console.log(JSON.stringify({ session: created.id, pageUrl: links.pageUrl }));
}

async function verifyStored(): Promise<void> {
  assert(session && file, "Usage: verify <session> <file>");
  const expected = new Uint8Array(await readFile(file));
  const transcript = await call<{
    value: { downloadUrl: string; utterances: unknown[] };
  }>("get", { ref: `transcript:${session}` });
  const download = await fetch(transcript.value.downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(download.status, 200);
  const stored = new Uint8Array(await download.arrayBuffer());
  console.log(`fixture  ${expected.length} bytes sha256 ${sha256(expected)}`);
  console.log(`stored   ${stored.length} bytes sha256 ${sha256(stored)}`);
  console.log(`utterances parsed: ${transcript.value.utterances.length}`);
  assert.deepEqual(stored, expected, "Stored file differs from the fixture");
  console.log("PASS stored file is byte-exact");
}

try {
  if (command === "session") await createSession();
  else if (command === "verify") await verifyStored();
  else throw new Error("Usage: session | verify <session> <file>");
} finally {
  await client.close();
}
