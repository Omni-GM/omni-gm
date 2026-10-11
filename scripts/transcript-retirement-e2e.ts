import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const [phase, statePath] = process.argv.slice(2);
assert(statePath, "Usage: seed|verify <private-state-file>");
const client = new Client({
  name: "transcript-retirement-proof",
  version: "1",
});
await client.connect(
  new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
const text = "[00:00:00] GM: The café lantern glows 🕯️.\r\n";
type State = {
  completed: string;
  incomplete: string;
  signed: string;
  url: string;
};
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
async function session(): Promise<string> {
  return (
    await call<{ id: string }>("session_create", { playedOn: "2026-01-03" })
  ).id;
}
try {
  if (phase === "seed") {
    await call("adventure_start", {
      name: "The Lantern Ferry",
      reason: "Invented migration proof",
    });
    const pendingSession = await session();
    for (let i = 0; i < 110; i++)
      await call("transcript_upload_url", { session: pendingSession });
    const completed = await session();
    await call("transcript_append", {
      session: completed,
      chunk: text,
      index: 0,
      final: true,
    });
    const incomplete = await session();
    const links = await call<{ url: string }>("transcript_upload_url", {
      session: incomplete,
    });
    assert.equal(
      (await fetch(links.url, { method: "PUT", body: text })).status,
      200,
    );
    for (let index = 0; index < 105; index++)
      await call("transcript_append", {
        session: incomplete,
        chunk: "[00:00:00] GM: Unfinished staging.\n",
        index,
        final: false,
      });
    const signed = await session();
    const pending = await call<{ url: string }>("transcript_upload_url", {
      session: signed,
    });
    await writeFile(
      statePath,
      JSON.stringify({
        completed,
        incomplete,
        signed,
        url: pending.url,
      } satisfies State),
      { mode: 0o600 },
    );
    console.log(
      "PASS baseline has 110 ordinary signed tickets before a completed chunk ticket, 105 unfinished chunks over a published transcript, and an unused signed URL",
    );
  } else {
    assert.equal(phase, "verify");
    const state = JSON.parse(await readFile(statePath, "utf8")) as State;
    const listed = await client.listTools();
    assert(!listed.tools.some((tool) => tool.name === "transcript_append"));
    for (const id of [state.completed, state.incomplete]) {
      const transcript = await call<{
        value: { downloadUrl: string; utterances: unknown[] };
      }>("get", { ref: `transcript:${id}` });
      const download: Response = await fetch(transcript.value.downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(download.status, 200);
      assert.deepEqual(
        Buffer.from(await download.arrayBuffer()),
        Buffer.from(text),
      );
      assert.equal(transcript.value.utterances.length, 1);
    }
    console.log(
      "PASS migration preserves exact published Unicode and CRLF bytes for both completed and interrupted chunk uploads",
    );
    assert.equal(
      (await fetch(state.url, { method: "PUT", body: text })).status,
      200,
    );
    console.log(
      "PASS existing signed upload capability survives staging cleanup and narrowed schema deployment",
    );
    console.log("TRANSCRIPT RETIREMENT MIGRATION E2E PASSED");
  }
} finally {
  await client.close();
}
