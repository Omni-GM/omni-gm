import { register } from "convex-mcp-gateway/test";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
function createTest() {
  const t = convexTest(schema, modules);
  register(t);
  return t;
}
function client(
  subject = "invented-gm",
  shared?: ReturnType<typeof createTest>,
) {
  const t = shared ?? createTest();
  const owner = t.withIdentity({ subject, issuer: "https://auth.example.com" });
  let session: string | null = null;
  let id = 0;
  async function rpc(method: string, params: Record<string, unknown> = {}) {
    const response = await owner.fetch("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(session ? { "Mcp-Session-Id": session } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    session = response.headers.get("Mcp-Session-Id") ?? session;
    const text = await response.text();
    const data =
      text.startsWith("event:") || text.startsWith("data:")
        ? text
            .split("\n")
            .find((l) => l.startsWith("data: "))
            ?.slice(6)
        : text;
    if (!data) throw new Error("Missing JSON-RPC response data");
    return JSON.parse(data);
  }
  async function call(name: string, args: Record<string, unknown> = {}) {
    const response = await rpc("tools/call", { name, arguments: args });
    if (response.error || response.result?.isError)
      throw new Error(JSON.stringify(response));
    expect(response.result.structuredContent).toBeDefined();
    return name === "get"
      ? (response.result.structuredContent.value ??
          response.result.structuredContent.items)
      : response.result.structuredContent;
  }
  return {
    t,
    owner,
    rpc,
    call,
    async init() {
      return rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "proof", version: "1" },
      });
    },
  };
}
test("the game master starts an adventure, records a session and recalls the seeded schema", async () => {
  const c = client();
  await c.init();
  const adventure = await c.call("adventure_start", {
    name: "The Glass Causeway",
    reason: "The party arrives",
  });
  expect(adventure.name).toBe("The Glass Causeway");
  const session = await c.call("session_create", { playedOn: "2026-01-03" });
  expect(session.ordinal).toBe(1);
  const state = await c.call("get", { ref: "overview" });
  expect(state.sessions[0].playedOn).toBe("2026-01-03");
  const schema = await c.call("get", { ref: "schema" });
  expect(schema.kinds.npc.playedAs).toBe("text");
  expect(state.commits[0].kind).toBe("seed");
});

test("the signed upload stores exact bytes, parses utterances, and is single-use", async () => {
  const c = client();
  await c.init();
  await c.call("adventure_start", {
    name: "The Glass Causeway",
    reason: "Arrived",
  });
  const s = await c.call("session_create", { playedOn: "2026-01-03" });
  const { url } = await c.call("transcript_upload_url", { session: s.id });
  const transcript =
    "[00:01:10] GM as Sera Venn: Mind the stones, dear.\r\n[00:02:20] Rowan: Sarah Ven seems nervous.\r\n";
  const upload = await c.t.fetch(new URL(url).pathname + new URL(url).search, {
    method: "PUT",
    body: transcript,
  });
  expect(upload.status).toBe(200);
  const stored = await c.call("get", { ref: `transcript:${s.id}` });
  expect(stored.utterances).toEqual([
    {
      at: "00:01:10",
      seconds: 70,
      speaker: "GM as Sera Venn",
      text: "Mind the stones, dear.",
    },
    {
      at: "00:02:20",
      seconds: 140,
      speaker: "Rowan",
      text: "Sarah Ven seems nervous.",
    },
  ]);
  const bytes = await c.owner.fetch(
    new URL(stored.downloadUrl).pathname + new URL(stored.downloadUrl).search,
  );
  expect(await bytes.text()).toBe(transcript);
  expect(
    (
      await c.t.fetch(new URL(url).pathname + new URL(url).search, {
        method: "PUT",
        body: transcript,
      })
    ).status,
  ).toBe(403);
});

const npcChange = (name = "Sera Venn") => ({
  scene: 1,
  change: {
    op: "new",
    tempKey: "sera",
    kind: "npc",
    name,
    aliases: ["Sarah Ven"],
    properties: { playedAs: "Softly, with a snapped final word" },
  },
  basis: ["npc_said"],
  sources: [{ quote: "Mind the stones, dear.", at: "00:01:10" }],
  why: "Keep the voice for next prep",
});
async function prepared(c = client()) {
  await c.init();
  await c.call("adventure_start", {
    name: "The Glass Causeway",
    reason: "Arrived",
  });
  const s = await c.call("session_create", { playedOn: "2026-01-03" });
  const { url } = await c.call("transcript_upload_url", { session: s.id });
  await c.t.fetch(new URL(url).pathname + new URL(url).search, {
    method: "PUT",
    body: "[00:01:10] GM as Sera Venn: Mind the stones, dear.\n[00:02:20] Rowan: I bet she works for the raiders.\n",
  });
  await c.call("scenes_set", {
    session: s.id,
    scenes: [
      {
        title: "The ferry",
        start: "00:01:10",
        end: "00:02:20",
        place: "Glass Causeway",
        summary: "Sera offers passage.",
      },
    ],
  });
  return { c, s };
}
test("a debrief keeps valid changes, rejects an invented property and an NPC guess, drops a change, then commits history", async () => {
  const { c, s } = await prepared();
  const result = await c.call("debrief_add", {
    session: s.id,
    lastTime: "At dusk by the ferry. The gate closes in four bells.",
    changes: [
      npcChange(),
      {
        ...npcChange("Other"),
        change: {
          op: "new",
          kind: "npc",
          name: "Other",
          properties: { secretPower: "invisible" },
        },
      },
      {
        ...npcChange(),
        change: {
          op: "update",
          entity: "$sera",
          properties: { wants: "Help raiders" },
        },
        basis: ["player_guess"],
      },
      {
        ...npcChange("Drop me"),
        change: { op: "new", kind: "thread", name: "Drop me" },
      },
    ],
  });
  expect(result.rejected).toHaveLength(2);
  expect(result.rejected[0].reason).toContain("playedAs");
  expect(result.rejected[1].reason).toContain("player_guess");
  expect(result.draft.changes).toHaveLength(2);
  expect(
    (await c.call("find", {})).hits.filter(
      (h: { type: string }) => h.type === "entity",
    ),
  ).toHaveLength(0);
  await c.call("debrief_drop", {
    session: s.id,
    changeIds: [result.draft.changes[1].id],
  });
  const committed = await c.call("debrief_commit", { session: s.id });
  expect(committed.draft.status).toBe("committed");
  const found = await c.call("find", { query: "Sarah Ven", types: ["entity"] });
  expect(found.hits).toHaveLength(1);
  const sera = await c.call("get", { ref: found.hits[0].ref });
  expect(sera.properties).toEqual({
    playedAs: "Softly, with a snapped final word",
  });
  expect(sera.history).toEqual([
    expect.objectContaining({
      session: s.id,
      scene: 1,
      basis: ["npc_said"],
      sources: [{ quote: "Mind the stones, dear.", at: "00:01:10" }],
      why: "Keep the voice for next prep",
      before: null,
      after: expect.objectContaining({ name: "Sera Venn" }),
    }),
  ]);
  expect((await c.call("get", { ref: "overview" })).lastTime).toBe(
    "At dusk by the ferry. The gate closes in four bells.",
  );
  await expect(
    c.call("debrief_add", { session: s.id, changes: [npcChange()] }),
  ).rejects.toThrow("story_commit");
  await expect(
    c.call("scenes_set", { session: s.id, scenes: [] }),
  ).rejects.toThrow("committed");
});

test("skills list and load the procedures with the standing rules, and initialize stays short", async () => {
  const c = client();
  const init = await c.init();
  expect(init.result.instructions.length).toBeLessThan(4096);
  expect(init.result.instructions).toContain("Never draft prep");
  const list = await c.call("skill");
  expect(list.skills.map((s: { name: string }) => s.name)).toEqual([
    "map-speakers",
    "split-scenes",
    "debrief",
  ]);
  for (const name of ["map speakers", "split scenes", "DEBRIEF"]) {
    const skill = await c.call("skill", { name });
    expect(skill.procedure).toMatch(
      /Never draft prep[\s\S]*Write in the game master's language\.$/,
    );
  }
  expect((await c.call("skill", { name: "debrief" })).procedure).toContain(
    "playedAs",
  );
});

test("schema rules reject each invalid change with allowed values and keep valid mixed-basis facts", async () => {
  const { c, s } = await prepared();
  const cases = [
    { ...npcChange(), change: { op: "new", kind: "dragon", name: "No kind" } },
    {
      ...npcChange(),
      change: {
        op: "new",
        kind: "npc",
        name: "No enum",
        properties: { status: "sleeping" },
      },
    },
    {
      ...npcChange(),
      change: {
        op: "new",
        kind: "clock",
        name: "No type",
        properties: { segments: "four" },
      },
    },
    { ...npcChange(), basis: [] },
    { ...npcChange(), sources: [] },
    { ...npcChange(), sources: [{ quote: " " }] },
    { ...npcChange(), scene: 9 },
    {
      ...npcChange(),
      change: { op: "new", kind: "place", name: "Guess place" },
      basis: ["player_plan"],
    },
    npcChange(),
    {
      ...npcChange(),
      change: {
        op: "new",
        tempKey: "place",
        kind: "place",
        name: "Ferry landing",
      },
    },
    {
      ...npcChange(),
      change: {
        op: "relate",
        type: "teleports_to",
        from: "$sera",
        to: "$place",
      },
    },
    {
      ...npcChange(),
      change: { op: "relate", type: "pursues", from: "$sera", to: "$place" },
    },
    {
      ...npcChange(),
      change: {
        op: "relate",
        type: "last_seen_at",
        from: "$sera",
        to: "$place",
      },
      basis: ["player_guess", "player_plan"],
    },
    {
      ...npcChange(),
      change: {
        op: "relate",
        type: "last_seen_at",
        from: "$sera",
        to: "$place",
      },
      basis: ["narrated", "player_guess"],
    },
    {
      ...npcChange(),
      change: {
        op: "new",
        kind: "thread",
        name: "Raider suspicion",
        properties: { whatIsOpen: "Rowan suspects raider ties" },
      },
      basis: ["player_guess", "player_plan"],
    },
  ];
  const r = await c.call("debrief_add", {
    session: s.id,
    changes: cases,
    lastTime: "The ferry waits.",
  });
  expect(r.rejected.map((r: { index: number }) => r.index)).toEqual([
    0, 1, 2, 3, 4, 5, 6, 7, 10, 11, 12,
  ]);
  expect(r.rejected[0].reason).toContain("Allowed kinds: npc");
  expect(r.rejected[1].reason).toContain("alive, dead, gone, unknown");
  expect(r.rejected[2].reason).toContain("number");
  expect(r.rejected[8].reason).toContain("last_seen_at");
  expect(r.rejected[9].reason).toContain("player_character");
  await c.call("debrief_commit", { session: s.id });
  const hits = await c.call("find", { kinds: ["npc"] });
  const sera = await c.call("get", {
    ref: hits.hits.find((h: { type: string }) => h.type === "entity").ref,
  });
  expect(sera.relationships[0]).toMatchObject({
    type: "last_seen_at",
    label: "last seen at",
    inverseLabel: "last seen here",
  });
});

test("dropping a new entity leaves its dependants uncommittable and applies no partial state or history", async () => {
  const { c, s } = await prepared();
  const r = await c.call("debrief_add", {
    session: s.id,
    lastTime: "The ferry waits.",
    changes: [
      npcChange(),
      {
        ...npcChange(),
        change: {
          op: "update",
          entity: "$sera",
          properties: { status: "alive" },
        },
      },
      {
        ...npcChange(),
        change: { op: "new", kind: "thread", name: "Keep only in draft" },
      },
    ],
  });
  await c.call("debrief_drop", {
    session: s.id,
    changeIds: [r.draft.changes[0].id],
  });
  await expect(c.call("debrief_commit", { session: s.id })).rejects.toThrow(
    "Entity not found",
  );
  expect((await c.call("find", { types: ["entity", "source"] })).hits).toEqual(
    [],
  );
  expect(
    (await c.call("get", { ref: "overview" })).commits.map(
      (c: { kind: string }) => c.kind,
    ),
  ).toEqual(["seed"]);
  expect((await c.call("get", { ref: `debrief:${s.id}` })).status).toBe(
    "draft",
  );
});

test("another owner cannot read, edit, upload or download the campaign and cannot borrow an MCP session", async () => {
  const { c, s } = await prepared();
  await c.call("debrief_add", {
    session: s.id,
    changes: [npcChange()],
    lastTime: "The ferry waits.",
  });
  await c.call("debrief_commit", { session: s.id });
  const entity = (await c.call("find", { types: ["entity"] })).hits[0].ref;
  const other = client("other-invented-gm", c.t);
  await other.init();
  await other.call("adventure_start", {
    name: "A separate adventure",
    reason: "Test privacy",
  });
  expect((await other.call("find", {})).hits).toEqual([]);
  for (const ref of [
    `session:${s.id}`,
    `debrief:${s.id}`,
    `scene:${s.id}/1`,
    `transcript:${s.id}`,
    entity,
  ])
    await expect(other.call("get", { ref })).rejects.toThrow("not found");
  await expect(
    other.call("transcript_upload_url", { session: s.id }),
  ).rejects.toThrow("not found");
  await expect(
    other.call("debrief_drop", { session: s.id, changeIds: ["c1"] }),
  ).rejects.toThrow("not found");
  expect((await other.owner.fetch(`/transcripts/${s.id}`)).status).toBe(404);
  expect((await c.t.fetch(`/transcripts/${s.id}`)).status).toBe(401);
  const anonymous = await c.t.fetch("/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    }),
  });
  expect(anonymous.status).toBe(401);
});

test("get reads every slice ref and find searches each kind with basis visible on source hits", async () => {
  const { c, s } = await prepared();
  await c.call("debrief_add", {
    session: s.id,
    changes: [npcChange()],
    lastTime: "The ferry waits.",
  });
  await c.call("debrief_commit", { session: s.id });
  const refs = [
    "overview",
    "schema",
    `session:${s.id}`,
    `debrief:${s.id}`,
    `scene:${s.id}/1`,
    `transcript:${s.id}@00:01:10`,
  ];
  expect(
    (await c.call("get", { refs })).map((item: { ref: string }) => item.ref),
  ).toEqual(refs);
  for (const [query, type] of [
    ["Sarah", "entity"],
    ["stones", "source"],
    ["ferry", "scene"],
    ["raiders", "transcript"],
  ]) {
    const r = await c.call("find", { query, types: [type] });
    expect(r.hits[0].type).toBe(type);
    if (type === "source") expect(r.hits[0].snippet).toContain("npc_said");
    await c.call("get", { ref: r.hits[0].ref });
  }
  await expect(c.call("get", { ref: "frame" })).rejects.toThrow("Allowed refs");
  await expect(
    c.call("get", { refs: Array(26).fill("schema") }),
  ).rejects.toThrow("25");
  await expect(c.call("find", { limit: 201 })).rejects.toThrow("200");
});

test("find returns both an entity hit and a source hit when their get ref is the same", async () => {
  const { c, s } = await prepared();
  await c.call("debrief_add", {
    session: s.id,
    changes: [npcChange("Sera Stones")],
    lastTime: "The ferry waits.",
  });
  await c.call("debrief_commit", { session: s.id });
  const results = await c.call("find", {
    query: "stones",
    types: ["entity", "source"],
  });
  expect(results.hits.map((h: { type: string }) => h.type).sort()).toEqual([
    "entity",
    "source",
  ]);
  expect(results.hits[0].ref).toBe(results.hits[1].ref);
});

test("schema and skill names cannot borrow JavaScript prototype properties", async () => {
  const { c, s } = await prepared();
  const result = await c.call("debrief_add", {
    session: s.id,
    changes: [
      {
        ...npcChange(),
        change: { op: "new", kind: "constructor", name: "Unknown kind" },
      },
      {
        ...npcChange(),
        change: {
          op: "new",
          kind: "npc",
          name: "Unknown field",
          properties: { toString: "invented" },
        },
      },
    ],
  });
  expect(result.rejected).toHaveLength(2);
  expect(result.rejected[0].reason).toContain("Allowed kinds");
  expect(result.rejected[1].reason).toContain("Allowed properties");
  await expect(c.call("skill", { name: "constructor" })).rejects.toThrow(
    "Allowed skills",
  );
});

test("the advertised basis schema repeats the guess rule, and private identity is absent", async () => {
  const c = client();
  await c.init();
  const listed = await c.rpc("tools/list");
  const tool = listed.result.tools.find(
    (t: { name: string }) => t.name === "debrief_add",
  );
  expect(
    tool.inputSchema.properties.changes.items.properties.basis.description,
  ).toContain("player_guess");
  expect(tool.inputSchema.properties.caller).toBeUndefined();
  expect(tool.outputSchema.type).toBe("object");
});
