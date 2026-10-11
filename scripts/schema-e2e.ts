import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Infer } from "convex/values";
import type { commit, Entity, SchemaInfo, SchemaOp } from "../convex/model";

const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
if (!url || !token)
  throw new Error("Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "schema-change-proof", version: "1.0.0" });
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
    `Tool ${name} failed: ${JSON.stringify(result.content)}`,
  );
  assert(result.structuredContent, `${name} must return structuredContent`);
  return result.structuredContent as T;
}
const readSchema = async (): Promise<SchemaInfo> =>
  (await call<{ value: SchemaInfo }>("get", { ref: "schema" })).value;
const readCommits = async (): Promise<Infer<typeof commit>[]> =>
  (
    await call<{ value: { commits: Infer<typeof commit>[] } }>("get", {
      ref: "overview",
    })
  ).value.commits;
const evidence = {
  scene: 1,
  basis: ["game_master"],
  sources: [{ quote: "Sera mentors Rowan at the ferry." }],
  why: "Invented story proof",
};
async function session(): Promise<string> {
  const s = await call<{ id: string }>("session_create", {
    playedOn: "2026-01-03",
  });
  const upload = await call<{ url: string }>("transcript_upload_url", {
    session: s.id,
  });
  assert.equal(
    (
      await fetch(upload.url, {
        method: "PUT",
        body: "[00:00:00] GM: Sera mentors Rowan at the ferry.",
      })
    ).status,
    200,
  );
  await call("scenes_set", {
    session: s.id,
    scenes: [
      {
        title: "The ferry",
        start: "00:00:00",
        place: "Glass Causeway",
        summary: "Sera mentors Rowan.",
      },
    ],
  });
  return s.id;
}
try {
  console.log(`PREVIEW TARGET ${new URL(url).origin}`);
  const listed = await client.listTools();
  const tool = listed.tools.find((tool) => tool.name === "schema_change");
  assert(tool);
  assert(tool.description?.includes("explicit request"));
  assert(tool.outputSchema);
  assert(!Object.hasOwn(tool.inputSchema.properties ?? {}, "caller"));
  await call("adventure_start", {
    name: "The Glass Causeway",
    reason: "Invented schema proof",
  });
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const key = `greeting_${suffix}`;
  const mood = `mood_${suffix}`;
  const patience = `patience_${suffix}`;
  const type = `mentors_${suffix}`;
  const ops: SchemaOp[] = [
    {
      op: "add_property",
      kind: "npc",
      key,
      type: "text",
      description: "How the NPC greets strangers",
    },
    {
      op: "add_property",
      kind: "npc",
      key: mood,
      type: "enum",
      enumValues: ["calm", "uneasy"],
      description: "Mood in the story",
    },
    {
      op: "add_property",
      kind: "npc",
      key: patience,
      type: "number",
      description: "Story clock for patience",
    },
    {
      op: "add_relationship_type",
      type,
      from: ["npc"],
      to: ["player_character"],
      label: "mentors",
      inverseLabel: "mentored by",
      description: "Who taught the character",
    },
  ];
  const reason =
    "The game master explicitly asked to remember greetings, moods and teachers";
  const added = await call<{ commit: string; schema: SchemaInfo }>(
    "schema_change",
    { reason, ops },
  );
  const schema = await readSchema();
  assert.equal(schema.kinds.npc[key], "text");
  assert.deepEqual(schema.kinds.npc[mood], ["calm", "uneasy"]);
  assert.equal(schema.kinds.npc[patience], "number");
  assert.deepEqual(schema, added.schema);
  const s = await session();
  const drafted = await call<{ rejected: { index: number; reason: string }[] }>(
    "debrief_add",
    {
      session: s,
      briefing: "Sera mentors Rowan at the ferry.",
      changes: [
        {
          ...evidence,
          change: {
            op: "new",
            tempKey: "sera",
            kind: "npc",
            name: "Sera Venn",
            properties: {
              [key]: "Bows before speaking",
              [mood]: "uneasy",
              [patience]: 3,
            },
          },
        },
        {
          ...evidence,
          change: {
            op: "new",
            tempKey: "rowan",
            kind: "player_character",
            name: "Rowan",
          },
        },
        {
          ...evidence,
          change: { op: "relate", type, from: "$sera", to: "$rowan" },
        },
        {
          ...evidence,
          change: {
            op: "update",
            entity: "$sera",
            properties: { [mood]: "angry" },
          },
        },
        {
          ...evidence,
          change: {
            op: "update",
            entity: "$sera",
            properties: { [patience]: "three" },
          },
        },
        {
          ...evidence,
          change: { op: "relate", type, from: "$rowan", to: "$sera" },
        },
      ],
    },
  );
  assert.deepEqual(
    drafted.rejected.map((r) => r.index),
    [3, 4, 5],
  );
  await call("debrief_commit", { session: s });
  const found = await call<{ hits: { ref: string }[] }>("find", {
    kinds: ["npc"],
    types: ["entity"],
    limit: 200,
  });
  type ReadEntity = Entity & {
    history: { session: string }[];
    relationships: { type: string; label: string; inverseLabel: string }[];
  };
  const candidates = await Promise.all(
    found.hits.map(async (hit) => ({
      ref: hit.ref,
      value: (await call<{ value: ReadEntity }>("get", { ref: hit.ref })).value,
    })),
  );
  const npc = candidates.find((npc) =>
    npc.value.history.some((h) => h.session === s),
  );
  assert(npc);
  assert.equal(npc.value.properties[key], "Bows before speaking");
  assert(
    npc.value.relationships.some(
      (rel) =>
        rel.type === type &&
        rel.label === "mentors" &&
        rel.inverseLabel === "mentored by",
    ),
  );
  console.log(
    "PASS added text, enum, number and relationship definitions are immediately usable; invalid writes rejected",
  );
  const pending = await session();
  await call("debrief_add", {
    session: pending,
    briefing: "Pending greeting.",
    changes: [
      {
        ...evidence,
        change: {
          op: "update",
          entity: npc.ref,
          properties: { [key]: "Whispers" },
        },
      },
    ],
  });
  const retireOps: SchemaOp[] = [{ op: "retire_property", kind: "npc", key }];
  const retireReason =
    "The game master explicitly asked to stop recording greetings";
  const retired = await call<{ commit: string }>("schema_change", {
    reason: retireReason,
    ops: retireOps,
  });
  const current = await readSchema();
  assert.equal(current.kinds.npc[key], undefined);
  assert.equal(current.retiredProperties.npc[key], "text");
  assert.deepEqual(
    (await call<{ value: ReadEntity }>("get", { ref: npc.ref })).value,
    npc.value,
  );
  await assert.rejects(
    call("debrief_commit", { session: pending }),
    /Allowed properties/,
  );
  await assert.rejects(
    call("debrief_add", {
      session: pending,
      changes: [
        {
          ...evidence,
          change: {
            op: "update",
            entity: npc.ref,
            properties: { role: "Ferry keeper" },
          },
        },
      ],
    }),
    /Pending change c1.*debrief_drop/,
  );
  await assert.rejects(
    call("debrief_drop", { session: pending, changeIds: [] }),
    /invalid remaining changes: c1/,
  );
  await call("debrief_drop", { session: pending, changeIds: ["c1"] });
  const rejected = await call<{ rejected: { index: number }[] }>(
    "debrief_add",
    {
      session: pending,
      changes: [
        {
          ...evidence,
          change: {
            op: "new",
            kind: "npc",
            name: "Rejected greeting",
            properties: { [key]: "Hello" },
          },
        },
        {
          ...evidence,
          change: {
            op: "update",
            entity: npc.ref,
            properties: { [key]: "Hello" },
          },
        },
        {
          ...evidence,
          change: {
            op: "update",
            entity: npc.ref,
            properties: { role: "Ferry keeper" },
          },
        },
      ],
    },
  );
  assert.deepEqual(
    rejected.rejected.map((r) => r.index),
    [0, 1],
  );
  await call("debrief_commit", { session: pending });
  const preserved = (await call<{ value: ReadEntity }>("get", { ref: npc.ref }))
    .value;
  assert.equal(preserved.properties[key], "Bows before speaking");
  assert.deepEqual(preserved.history[0], npc.value.history[0]);
  console.log(
    "PASS retirement rejects new and pending writes, preserves old values and history, permits unrelated updates",
  );
  const commits = await readCommits();
  for (const expected of [
    { id: added.commit, reason, ops },
    { id: retired.commit, reason: retireReason, ops: retireOps },
  ]) {
    const entry = commits.find((c) => c.id === expected.id);
    assert.equal(entry?.kind, "schema");
    assert.equal(entry?.reason, expected.reason);
    assert.deepEqual(entry?.schemaChange?.ops, expected.ops);
    assert(entry?.schemaChange?.before && entry.schemaChange.after);
  }
  console.log(
    "PASS schema operations and reasons share the commit history with before/after definitions",
  );
  const beforeInvalid = await readSchema();
  const beforeCommits = await readCommits();
  await assert.rejects(
    call("schema_change", {
      reason: "Invented invalid batch",
      ops: [
        { ...ops[0], key: `unused_${suffix}` },
        { op: "retire_property", kind: "npc", key: "missing" },
      ],
    }),
  );
  assert.deepEqual(await readSchema(), beforeInvalid);
  assert.deepEqual(await readCommits(), beforeCommits);
  await assert.rejects(
    call("schema_change", {
      reason: "Cannot redefine old values",
      ops: [ops[0]],
    }),
    /retired/,
  );
  console.log(
    "PASS invalid batch leaves no partial schema or history; retired names cannot be reused",
  );
  console.log(`PROOF SESSION ${s}`);
  console.log("SCHEMA SDK E2E PASSED");
} finally {
  await client.close();
}
