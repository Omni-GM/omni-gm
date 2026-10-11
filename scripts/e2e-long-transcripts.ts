import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { longSession, type TranscriptLine } from "../fixtures/long-session";

const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
if (!url || !token)
  throw new Error("Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({
  name: "omni-gm-long-transcript-proof",
  version: "1.0.0",
});
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
  assert(
    !result.isError,
    `Tool ${name} failed: ${result.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join(" ")}`,
  );
  assert(result.structuredContent, `${name} must return structuredContent`);
  return result.structuredContent as T;
}
type Page = {
  utterances: TranscriptLine[];
  truncated: boolean;
  nextCursor: string | null;
  downloadUrl?: string;
};
async function readAll(
  ref: string,
  initialCursor: string | null = null,
): Promise<{ utterances: TranscriptLine[]; pages: number }> {
  const utterances: TranscriptLine[] = [];
  let cursor: string | null = initialCursor;
  let pages = 0;
  const cursors = new Set<string>();
  do {
    const { value }: { value: Page } = await call("get", {
      ref,
      limit: 200,
      cursor,
    });
    assert.equal(value.truncated, value.nextCursor !== null);
    assert(value.utterances.length <= 200);
    utterances.push(...value.utterances);
    cursor = value.nextCursor;
    if (cursor) {
      assert(!cursors.has(cursor), "Continuation must advance");
      cursors.add(cursor);
    }
    assert(++pages <= 1000, "Read must terminate");
  } while (cursor);
  return { utterances, pages };
}
try {
  const marker = `proof${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const fixture = longSession(marker);
  assert.equal(fixture.utterances.length, 4801);
  assert.equal(fixture.utterances.at(-1)?.seconds, 14400);
  const tailMarker = `${marker}tail`;
  const last = fixture.utterances.at(-1);
  assert(last);
  last.text += ` ${tailMarker}`;
  fixture.text = `${fixture.utterances
    .map((u) => `[${u.at}] ${u.speaker}: ${u.text}`)
    .join("\r\n")}\r\n`;
  const bytes = Buffer.from(fixture.text, "utf8");
  console.log(
    `Invented fixture: ${fixture.utterances.length} utterances, 04:00:00 of play, ${bytes.length} bytes, SHA-256 ${createHash("sha256").update(bytes).digest("hex")}`,
  );
  await call("adventure_start", {
    name: "The Lantern Road",
    reason: "Invented long-transcript proof",
  });
  const session = await call<{ id: string }>("session_create", {
    playedOn: "2026-01-03",
  });
  const { url: uploadUrl } = await call<{ url: string }>(
    "transcript_upload_url",
    { session: session.id },
  );
  const response = await fetch(uploadUrl, { method: "PUT", body: bytes });
  assert.equal(response.status, 200, `Upload failed: ${await response.text()}`);
  console.log("PASS signed upload of 4,801 utterances in bounded batches");
  const { value: first } = await call<{ value: Page }>("get", {
    ref: `transcript:${session.id}`,
    limit: 200,
  });
  assert(first.truncated && first.nextCursor);
  assert(first.downloadUrl);
  const download = await fetch(first.downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  console.log(
    "PASS authenticated download preserves exact UTF-8 bytes and CRLF",
  );
  await call("scenes_set", {
    session: session.id,
    scenes: Array.from({ length: 4 }, (_, i) => ({
      title: `Lantern road, hour ${i + 1}`,
      start: `0${i}:00:00`,
      ...(i === 3 ? { end: "04:00:00" } : {}),
      place: "The causeway",
      summary: "The party follows the river and returns to the lantern gate.",
    })),
  });
  console.log("PASS four scenes include the true end at 04:00:00");
  const full = await readAll(`transcript:${session.id}`);
  assert.deepEqual(full.utterances, fixture.utterances);
  console.log(
    `PASS ${full.pages} transcript pages read every utterance with no gaps or duplicates`,
  );
  const sceneLines: TranscriptLine[] = [];
  let scenePages = 0;
  for (let i = 1; i <= 4; i++) {
    const scene = await readAll(`scene:${session.id}/${i}`);
    sceneLines.push(...scene.utterances);
    scenePages += scene.pages;
  }
  assert.deepEqual(sceneLines, fixture.utterances);
  console.log(
    `PASS ${scenePages} scene pages reproduce the complete transcript without overlap`,
  );
  const batch = await call<{ items: { value: Page }[] }>("get", {
    refs: [`transcript:${session.id}`, `scene:${session.id}/4`],
  });
  assert(
    batch.items.every((item) => item.value.truncated && item.value.nextCursor),
  );
  const batchTail = await readAll(
    `transcript:${session.id}`,
    batch.items[0].value.nextCursor,
  );
  assert.deepEqual(
    [...batch.items[0].value.utterances, ...batchTail.utterances],
    fixture.utterances,
  );
  console.log(
    "PASS multi-ref reads expose independent cursors and one continues to the complete transcript",
  );
  type Search = {
    hits: { id: string; ref: string; type: string; snippet: string }[];
    total: number;
    totalIsExact: boolean;
    truncated: boolean;
    nextCursor: string | null;
  };
  let sparseCursor: string | null = null;
  const sparseHits: Search["hits"] = [];
  let sparsePages = 0;
  do {
    const result: Search = await call("find", {
      query: tailMarker,
      types: ["transcript"],
      cursor: sparseCursor,
    });
    sparseHits.push(...result.hits);
    sparseCursor = result.nextCursor;
    assert(
      ++sparsePages <= 1000,
      "Sparse search must terminate even when the preview already contains earlier proof sessions",
    );
  } while (sparseCursor);
  assert.equal(sparseHits.length, 1);
  assert.equal(sparseHits[0].ref, `transcript:${session.id}@04:00:00`);
  console.log(
    `PASS sparse final-utterance search completes in ${sparsePages} bounded requests`,
  );
  let cursor: string | null = null;
  const hits: Search["hits"] = [];
  let searchPages = 0;
  do {
    const result: Search = await call("find", {
      query: marker,
      types: ["transcript"],
      limit: 200,
      cursor,
    });
    assert.equal(result.truncated, result.nextCursor !== null);
    assert.equal(result.totalIsExact, !result.truncated);
    hits.push(...result.hits);
    cursor = result.nextCursor;
    if (!cursor) assert.equal(result.total, 4800);
    assert(++searchPages < 1000);
  } while (cursor);
  assert.equal(hits.length, 4800);
  assert.equal(new Set(hits.map((h) => h.id)).size, 4800);
  assert(hits.every((h) => h.ref.startsWith(`transcript:${session.id}@`)));
  console.log(
    `PASS ${searchPages} search pages return all 4,800 matching utterances beyond the old 200-candidate cap`,
  );
  const mixed = await call<Search>("find", {
    query: "lantern",
    types: ["scene", "transcript"],
    limit: 10,
  });
  assert(mixed.hits.some((h) => h.type === "scene"));
  assert(mixed.hits.some((h) => h.type === "transcript"));
  console.log(
    "PASS multi-type search reads native paginated indexes through the SDK",
  );
  console.log(`PROOF SESSION ${session.id}`);
  console.log("LONG TRANSCRIPT SDK E2E PASSED");
} finally {
  await client.close();
}
