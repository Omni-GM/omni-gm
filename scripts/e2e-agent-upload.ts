import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { longSession, type TranscriptLine } from "../fixtures/long-session";

const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "omni-gm-agent-upload-proof", version: "1" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);

async function call<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = (await client.callTool({
    name,
    arguments: args,
  })) as CallToolResult;
  assert(!result.isError, JSON.stringify(result.content));
  assert(result.structuredContent, `${name} must return structuredContent`);
  return result.structuredContent as T;
}

type Page = {
  utterances: TranscriptLine[];
  nextCursor: string | null;
  downloadUrl: string;
};
type Reply = { uploaded: boolean; nextIndex: number; bytes: number };

function transcriptText(utterances: TranscriptLine[]): string {
  return `${utterances.map((u) => `[${u.at}] ${u.speaker}: ${u.text}`).join("\r\n")}\r\n`;
}

try {
  const fixture = longSession("InventedUploadProof");
  fixture.utterances[0].text += " Café lantern 🕯️.";
  const maximum = process.argv.includes("--max-bytes");
  if (maximum) {
    const extra =
      8_000_000 - Buffer.byteLength(transcriptText(fixture.utterances));
    const each = Math.floor(extra / fixture.utterances.length);
    const remainder = extra % fixture.utterances.length;
    fixture.utterances.forEach((u, i) => {
      u.text += " ".repeat(each + (i < remainder ? 1 : 0));
    });
  }
  fixture.text = transcriptText(fixture.utterances);
  const bytes = Buffer.from(fixture.text);
  if (maximum) assert.equal(bytes.length, 8_000_000);
  console.log(
    `Invented four-hour fixture: ${fixture.utterances.length} utterances, ${bytes.length} UTF-8 bytes, SHA-256 ${createHash("sha256").update(bytes).digest("hex")}`,
  );
  await call("adventure_start", {
    name: "The Lantern Road",
    reason: "Invented agent upload proof",
  });
  const session = await call<{ id: string }>("session_create", {
    playedOn: "2026-01-03",
  });
  let start = 0;
  let index = 0;
  while (start < bytes.length) {
    let end = Math.min(start + 64_000, bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    const args = {
      session: session.id,
      chunk: bytes.subarray(start, end).toString("utf8"),
      index,
      final: end === bytes.length,
    };
    const result = await call<Reply>("transcript_append", args);
    assert.equal(result.uploaded, args.final);
    assert.equal(result.nextIndex, index + 1);
    assert.equal(result.bytes, end);
    if (index === 0 || args.final)
      assert.deepEqual(await call("transcript_append", args), result);
    start = end;
    index++;
  }
  console.log(
    `PASS agent tool uploaded ${index} chunks; first and final duplicate retries are idempotent`,
  );
  const utterances: TranscriptLine[] = [];
  let cursor: string | null = null;
  let downloadUrl = "";
  let pages = 0;
  do {
    const { value }: { value: Page } = await call("get", {
      ref: `transcript:${session.id}`,
      limit: 200,
      cursor,
    });
    utterances.push(...value.utterances);
    cursor = value.nextCursor;
    downloadUrl = value.downloadUrl;
    assert(++pages < 1000, "Pagination must terminate");
  } while (cursor);
  assert.deepEqual(utterances, fixture.utterances);
  console.log(
    `PASS ${pages} SDK pages read back all 4,801 utterances without gaps or duplicates`,
  );
  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  console.log(
    "PASS authenticated download preserves every original byte, Unicode and CRLF",
  );
  await call("scenes_set", {
    session: session.id,
    scenes: [
      {
        title: "The lantern road",
        start: "00:00:00",
        end: "04:00:00",
        place: "The causeway",
        summary: "The party follows the road and returns at dawn.",
      },
    ],
  });
  const locked = (await client.callTool({
    name: "transcript_append",
    arguments: {
      session: session.id,
      chunk: "[00:00:00] GM: Changed.\n",
      index: 0,
      final: true,
      restart: true,
    },
  })) as CallToolResult;
  assert(locked.isError && JSON.stringify(locked.content).includes("locked"));
  console.log("PASS hosted scene lock also blocks tool restarts");
  console.log(`PROOF SESSION ${session.id}`);
  console.log("AGENT UPLOAD SDK E2E PASSED");
} finally {
  await client.close();
}
