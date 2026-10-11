import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
const [phase, statePath] = process.argv.slice(2);
assert(
  url && token && statePath,
  "Set MCP URL/token; pass seed|verify and a scratch state file",
);
const client = new Client({ name: "omni-gm-upgrade-proof", version: "1.0.0" });
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
type State = { session: string; marker: string; text: string; lines: string[] };
type Page = {
  utterances: { text: string }[];
  truncated: boolean;
  nextCursor: string | null;
  downloadUrl: string;
};
type Search = { hits: { id: string }[]; nextCursor: string | null };
try {
  if (phase === "seed") {
    await call("adventure_start", {
      name: "The old ferry",
      reason: "Invented legacy-upgrade proof",
    });
    const session = await call<{ id: string }>("session_create", {
      playedOn: "2026-01-03",
    });
    const marker = `upgrade${randomUUID().replaceAll("-", "")}`;
    const lines = Array.from(
      { length: 250 },
      (_, i) => `${marker} message ${i}.`,
    );
    const text = lines.map((line) => `[00:00:00] GM: ${line}`).join("\r\n");
    const { url: uploadUrl } = await call<{ url: string }>(
      "transcript_upload_url",
      { session: session.id },
    );
    assert.equal(
      (await fetch(uploadUrl, { method: "PUT", body: text })).status,
      200,
    );
    await writeFile(
      statePath,
      JSON.stringify({
        session: session.id,
        marker,
        text,
        lines,
      } satisfies State),
    );
    console.log(
      "PASS baseline deployment uploaded 250 old-shape utterances at repeated timestamps through MCP",
    );
  } else {
    assert.equal(phase, "verify");
    const state = JSON.parse(await readFile(statePath, "utf8")) as State;
    const ref = `transcript:${state.session}`;
    const { value: first } = await call<{ value: Page }>("get", {
      ref,
      limit: 50,
    });
    assert(first.truncated && first.nextCursor);
    const lines = [...first.utterances];
    let cursor: string | null = first.nextCursor;
    while (cursor) {
      const { value }: { value: Page } = await call("get", {
        ref,
        limit: 50,
        cursor,
      });
      lines.push(...value.utterances);
      cursor = value.nextCursor;
    }
    assert.deepEqual(
      lines.map((line) => line.text),
      state.lines,
    );
    const download = await fetch(first.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(download.status, 200);
    assert.equal(await download.text(), state.text);
    console.log(
      "PASS upgraded transcript pages and authenticated download preserve every legacy row and original byte",
    );
    const ids = new Set<string>();
    cursor = null;
    do {
      const result: Search = await call("find", {
        query: state.marker,
        types: ["transcript"],
        limit: 100,
        cursor,
      });
      for (const hit of result.hits) {
        assert(!ids.has(hit.id));
        ids.add(hit.id);
      }
      cursor = result.nextCursor;
    } while (cursor);
    assert.equal(ids.size, 250);
    console.log(
      "PASS search reads all 250 legacy utterances without collapsing their shared timestamp",
    );
    const { url: uploadUrl } = await call<{ url: string }>(
      "transcript_upload_url",
      { session: state.session },
    );
    assert.equal(
      (
        await fetch(uploadUrl, {
          method: "PUT",
          body: "[00:00:00] GM: New ferry.",
        })
      ).status,
      200,
    );
    const stale = (await client.callTool({
      name: "get",
      arguments: { ref, cursor: first.nextCursor },
    })) as CallToolResult;
    assert(stale.isError);
    const { value: replaced } = await call<{ value: Page }>("get", { ref });
    assert.deepEqual(
      replaced.utterances.map((line) => line.text),
      ["New ferry."],
    );
    let count = 0;
    cursor = null;
    do {
      const result: Search = await call("find", {
        query: state.marker,
        types: ["transcript"],
        cursor,
      });
      count += result.hits.length;
      cursor = result.nextCursor;
    } while (cursor);
    assert.equal(count, 0);
    console.log(
      "PASS replacement hides the legacy generation and rejects its old cursor",
    );
    console.log("LEGACY TRANSCRIPT UPGRADE E2E PASSED");
  }
} finally {
  await client.close();
}
