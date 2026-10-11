import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
if (!url || !token)
  throw new Error("Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "omni-gm-proof", version: "1.0.0" });
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
  assert(result.structuredContent, `${name} must return structuredContent`);
  return result.structuredContent as T;
}
type Draft = {
  session: string;
  status: string;
  lastTime: string;
  changes: { id: string; change: { kind?: string; name?: string } }[];
};
try {
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: "{}",
      })
    ).status,
    401,
  );
  console.log("PASS anonymous endpoint requires auth");
  await call("adventure_start", {
    name: "The Glass Causeway",
    reason: "Invented proof session",
  });
  const session = await call<{ id: string }>("session_create", {
    playedOn: "2026-01-03",
  });
  const upload = await call<{ url: string }>("transcript_upload_url", {
    session: session.id,
  });
  const fixture = await readFile(
    new URL("../fixtures/session.txt", import.meta.url),
  );
  assert.equal(
    (
      await fetch(upload.url, {
        method: "PUT",
        body: fixture,
        headers: { "Content-Type": "text/plain" },
      })
    ).status,
    200,
  );
  const transcript = await call<{
    value: { downloadUrl: string; utterances: unknown[] };
  }>("get", { ref: `transcript:${session.id}` });
  const download = await fetch(transcript.value.downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), fixture);
  assert.equal(transcript.value.utterances.length, 7);
  assert.equal(
    (await fetch(upload.url, { method: "PUT", body: fixture })).status,
    403,
  );
  console.log("PASS byte-exact signed upload, parsed utterances, single use");
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
  console.log("PASS scenes stored");
  const evidence = {
    scene: 1,
    basis: ["npc_said"],
    sources: [
      { quote: "Mind the stones, dear. My ferry is waiting.", at: "00:01:10" },
    ],
    why: "Remember the voiced NPC",
  };
  const lastTime =
    "At dusk at the ferry landing. Pulling forward: the broken seal and the gatekeeper's red cord. Ticking: gate closes, 1/4, visible. Also open: Rowan's suspicion of raider ties, a guess; the Lantern Widow, a rumor.";
  const added = await call<{
    draft: Draft;
    rejected: { index: number; reason: string }[];
  }>("debrief_add", {
    session: session.id,
    lastTime,
    changes: [
      {
        ...evidence,
        change: {
          op: "new",
          tempKey: "sera",
          kind: "npc",
          name: "Sera Venn",
          aliases: ["Sarah Ven"],
          properties: {
            playedAs: "Soft voice with a snapped final word",
            role: "Ferry keeper",
          },
        },
      },
      {
        ...evidence,
        change: {
          op: "update",
          entity: "$sera",
          properties: { inventedPower: "invisible" },
        },
      },
      {
        ...evidence,
        basis: ["player_guess"],
        sources: [
          { quote: "I bet she works for the raiders.", at: "00:02:20" },
        ],
        change: {
          op: "update",
          entity: "$sera",
          properties: { wants: "Help the raiders" },
        },
      },
      {
        ...evidence,
        basis: ["narrated"],
        sources: [
          {
            quote:
              "The gate clock has four segments, one filled; you can all see it.",
            at: "00:04:00",
          },
        ],
        change: {
          op: "new",
          kind: "clock",
          name: "River gate closes",
          properties: {
            countsToward: "The gate closes",
            segments: 4,
            filled: 1,
            visibleToPlayers: "shown",
          },
        },
      },
      {
        ...evidence,
        change: {
          op: "new",
          kind: "thread",
          name: "Discard this draft proposal",
        },
      },
    ],
  });
  assert.deepEqual(
    added.rejected.map((r) => r.index),
    [1, 2],
  );
  assert.match(added.rejected[0].reason, /Allowed properties/);
  assert.match(added.rejected[1].reason, /player_guess/);
  console.log(
    "PASS invented property and NPC player guess rejected independently",
  );
  const dropId = added.draft.changes.find(
    (c) => c.change.name === "Discard this draft proposal",
  )?.id;
  assert(dropId);
  const dropped = await call<{ draft: Draft }>("debrief_drop", {
    session: session.id,
    changeIds: [dropId],
  });
  assert.equal(dropped.draft.changes.length, 2);
  console.log("PASS drop returns the updated draft");
  const committed = await call<{ draft: Draft }>("debrief_commit", {
    session: session.id,
  });
  assert.equal(committed.draft.status, "committed");
  console.log("PASS atomic commit");
  const found = await call<{ hits: { ref: string }[] }>("find", {
    query: "Sarah Ven",
    types: ["entity"],
  });
  assert.equal(found.hits.length, 1);
  const npc = await call<{
    value: {
      properties: Record<string, string | number>;
      history: {
        session: string;
        scene: number;
        basis: string[];
        sources: { quote: string; at: string }[];
        why: string;
      }[];
    };
  }>("get", { ref: found.hits[0].ref });
  assert.equal(
    npc.value.properties.playedAs,
    "Soft voice with a snapped final word",
  );
  assert.equal(npc.value.properties.wants, undefined);
  assert.equal(npc.value.history[0].session, session.id);
  assert.equal(npc.value.history[0].scene, 1);
  assert.deepEqual(npc.value.history[0].basis, ["npc_said"]);
  const sources = await call<{ hits: { snippet: string }[] }>("find", {
    query: "stones",
    types: ["source"],
  });
  assert(sources.hits.some((h) => h.snippet.includes("npc_said")));
  const overview = await call<{ value: { lastTime: string } }>("get", {
    ref: "overview",
  });
  assert.equal(overview.value.lastTime, lastTime);
  console.log(
    "PASS alias lookup, playedAs, history with basis and sources, lastTime read back",
  );
  console.log(`PROOF SESSION ${session.id}`);
  console.log("SDK E2E PASSED");
} finally {
  await client.close();
}
