import { register } from "convex-mcp-gateway/test";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../convex/schema";
import { longSession } from "../fixtures/long-session";

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
    sessionId: () => session,
    borrowSession: (value: string | null) => {
      session = value;
    },
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

test("dropping a parent refuses to break dependants and the retained draft can still accept and commit changes", async () => {
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
  await expect(
    c.call("debrief_drop", {
      session: s.id,
      changeIds: [r.draft.changes[0].id],
    }),
  ).rejects.toThrow("c2");
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
  const next = await c.call("debrief_add", {
    session: s.id,
    changes: [
      {
        ...npcChange(),
        change: { op: "new", kind: "thread", name: "Another valid proposal" },
      },
    ],
  });
  expect(next.rejected).toEqual([]);
  expect(next.draft.changes).toHaveLength(4);
  await c.call("debrief_drop", { session: s.id, changeIds: ["c1", "c2"] });
  await c.call("debrief_commit", { session: s.id });
  expect(
    (await c.call("find", { types: ["entity"] })).hits
      .map((h: { title: string }) => h.title)
      .sort(),
  ).toEqual(["Another valid proposal", "Keep only in draft"]);
});

test("another owner stays scoped when reusing an MCP transport session and cannot read, edit, upload or download the campaign", async () => {
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
  other.borrowSession(c.sessionId());
  await other.call("adventure_start", {
    name: "A separate adventure",
    reason: "Test privacy",
  });
  expect((await other.call("find", {})).hits).toEqual([]);
  expect(
    (
      await other.call("find", {
        query: "Sera",
        types: ["entity", "source", "scene", "transcript"],
      })
    ).hits,
  ).toEqual([]);
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
  for (const [name, args] of [
    ["debrief_add", { changes: [npcChange()] }],
    ["debrief_commit", {}],
    ["scenes_set", { scenes: [] }],
  ] as const)
    await expect(other.call(name, { session: s.id, ...args })).rejects.toThrow(
      "not found",
    );
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

test("list mode shows committed entities before scenes at a small limit", async () => {
  const { c, s } = await prepared();
  await c.call("debrief_add", {
    session: s.id,
    changes: [npcChange()],
    lastTime: "At the ferry.",
  });
  await c.call("debrief_commit", { session: s.id });
  const result = await c.call("find", { limit: 1 });
  expect(result.total).toBe(1);
  expect(result.totalIsExact).toBe(false);
  expect(result.hits[0].type).toBe("entity");
  const rest = await c.call("find", { limit: 1, cursor: result.nextCursor });
  expect(rest.hits[0].type).toBe("scene");
  expect(rest.total).toBe(2);
  expect(rest.totalIsExact).toBe(true);
  expect(rest.nextCursor).toBeNull();
});

test("an entity history remains readable after more than 2000 unrelated campaign changes", async () => {
  const { c, s } = await prepared();
  await c.call("debrief_add", {
    session: s.id,
    lastTime: "At the ferry.",
    changes: [
      npcChange(),
      {
        ...npcChange(),
        change: { op: "new", kind: "thread", name: "Busy thread" },
      },
    ],
  });
  await c.call("debrief_commit", { session: s.id });
  const npcRef = (await c.call("find", { types: ["entity"], kinds: ["npc"] }))
    .hits[0].ref;
  const threadRef = (
    await c.call("find", { types: ["entity"], kinds: ["thread"] })
  ).hits[0].ref;
  for (let i = 0; i < 4; i++) {
    const next = await prepared(c);
    await c.call("debrief_add", {
      session: next.s.id,
      lastTime: "Still at the ferry.",
      changes: Array.from({ length: 500 }, (_, n) => ({
        scene: 1,
        change: {
          op: "update",
          entity: threadRef,
          properties: { whatIsOpen: `Question ${i * 500 + n}` },
        },
        basis: ["narrated"],
        sources: [{ quote: "The question remains open." }],
        why: "Track the question",
      })),
    });
    await c.call("debrief_commit", { session: next.s.id });
  }
  const result = await c.call("get", { ref: npcRef });
  expect(result.history).toHaveLength(1);
  expect(result.history[0].session).toBe(s.id);
}, 30000);

test("find bounds query work and validates kind filters", async () => {
  const { c } = await prepared();
  await expect(
    c.call("find", { query: "one two three four five six seven eight nine" }),
  ).rejects.toThrow("8");
  await expect(c.call("find", { kinds: ["dragon"] })).rejects.toThrow(
    "Allowed kinds",
  );
});

test("find looks up Unicode names without unrelated prefix matches", async () => {
  const { c, s } = await prepared();
  await c.call("debrief_add", {
    session: s.id,
    lastTime: "At the ferry.",
    changes: [
      npcChange("Jörg Kühn"),
      { ...npcChange(), change: { op: "new", kind: "npc", name: "Jara Horn" } },
    ],
  });
  await c.call("debrief_commit", { session: s.id });
  const result = await c.call("find", { query: "Jörg", types: ["entity"] });
  expect(result.hits.map((h: { title: string }) => h.title)).toEqual([
    "Jörg Kühn",
  ]);
});

test("oversized proposals are rejected individually and temporary entities require tempKey references", async () => {
  const { c, s } = await prepared();
  const result = await c.call("debrief_add", {
    session: s.id,
    lastTime: "At the ferry.",
    changes: [
      { ...npcChange(), why: "x".repeat(17000) },
      npcChange(),
      {
        ...npcChange(),
        change: {
          op: "update",
          entity: "entity:draft-c1",
          properties: { status: "alive" },
        },
      },
      {
        ...npcChange(),
        change: { op: "new", kind: "thread", name: "Keep this" },
      },
    ],
  });
  expect(result.rejected.map((r: { index: number }) => r.index)).toEqual([
    0, 2,
  ]);
  expect(result.rejected[0].reason).toContain("16");
  expect(result.rejected[1].reason).toContain("$tempKey");
  expect(result.draft.changes).toHaveLength(2);
  await c.call("debrief_commit", { session: s.id });
});

test("adjacent scenes do not repeat the next scene's first utterance and session ordinal refs work", async () => {
  const { c, s } = await prepared();
  await c.call("scenes_set", {
    session: s.id,
    scenes: [
      {
        title: "First",
        start: "00:01:10",
        place: "Ferry",
        summary: "First exchange",
      },
      {
        title: "Second",
        start: "00:02:20",
        place: "Ferry",
        summary: "Second exchange",
      },
    ],
  });
  const first = await c.call("get", { ref: `scene:${s.id}/1` });
  expect(first.utterances.map((u: { at: string }) => u.at)).toEqual([
    "00:01:10",
  ]);
  const second = await c.call("get", { ref: `scene:${s.id}/2` });
  expect(second.utterances.map((u: { at: string }) => u.at)).toEqual([
    "00:02:20",
  ]);
  expect((await c.call("get", { ref: "session:1" })).id).toBe(s.id);
});

test("overview recalls the latest commit even when sessions are debriefed out of creation order", async () => {
  const { c, s } = await prepared();
  const later = await prepared(c);
  await c.call("debrief_add", {
    session: later.s.id,
    lastTime: "Newer-created session.",
    changes: [npcChange()],
  });
  await c.call("debrief_commit", { session: later.s.id });
  await c.call("debrief_add", {
    session: s.id,
    lastTime: "Most recently committed session.",
    changes: [npcChange()],
  });
  await c.call("debrief_commit", { session: s.id });
  const overview = await c.call("get", { ref: "overview" });
  expect(overview.lastTime).toBe("Most recently committed session.");
  expect(overview.commits[0].session).toBe(s.id);
});

test("source search keeps distinct claims about one entity with their own basis", async () => {
  const { c, s } = await prepared();
  await c.call("debrief_add", {
    session: s.id,
    lastTime: "At the ferry.",
    changes: [
      { ...npcChange(), sources: [{ quote: "Sera says the bridge is open." }] },
      {
        ...npcChange(),
        change: {
          op: "update",
          entity: "$sera",
          properties: { knows: "A bridge rumor" },
        },
        basis: ["rumor"],
        sources: [{ quote: "A rumor says the bridge is watched." }],
      },
    ],
  });
  await c.call("debrief_commit", { session: s.id });
  const result = await c.call("find", { query: "bridge", types: ["source"] });
  expect(result.hits).toHaveLength(2);
  expect(result.hits.map((h: { snippet: string }) => h.snippet)).toEqual(
    expect.arrayContaining([
      "npc_said: Sera says the bridge is open.",
      "rumor: A rumor says the bridge is watched.",
    ]),
  );
});

test("a huge continuation utterance is rejected as content and its upload URL can still be used", async () => {
  const c = client();
  await c.init();
  await c.call("adventure_start", { name: "Ferry", reason: "Invented proof" });
  const s = await c.call("session_create", { playedOn: "2026-01-03" });
  const { url } = await c.call("transcript_upload_url", { session: s.id });
  const path = new URL(url).pathname + new URL(url).search;
  const failed = await c.t.fetch(path, {
    method: "PUT",
    body: "[00:00:00] GM: Hello\n" + "x".repeat(600000),
  });
  expect(failed.status).toBe(400);
  expect(await failed.text()).toContain("32 KB");
  const retry = await c.t.fetch(path, {
    method: "PUT",
    body: "[00:00:00] GM: Hello",
  });
  expect(retry.status).toBe(200);
});

test("a conflicting commit applies no partial entities, history or commit marker", async () => {
  const { c, s } = await prepared();
  await c.call("debrief_add", {
    session: s.id,
    lastTime: "At the ferry.",
    changes: [
      npcChange(),
      {
        ...npcChange(),
        change: { op: "new", kind: "place", name: "Ferry landing" },
      },
    ],
  });
  await c.call("debrief_commit", { session: s.id });
  const npc = (await c.call("find", { types: ["entity"], kinds: ["npc"] }))
    .hits[0].ref;
  const place = (await c.call("find", { types: ["entity"], kinds: ["place"] }))
    .hits[0].ref;
  const pending = await prepared(c);
  const competing = await prepared(c);
  const relationship = {
    ...npcChange(),
    change: { op: "relate", type: "last_seen_at", from: npc, to: place },
  };
  await c.call("debrief_add", {
    session: pending.s.id,
    lastTime: "Uncommitted.",
    changes: [
      {
        ...npcChange(),
        change: {
          op: "new",
          kind: "thread",
          name: "Must remain only in draft",
        },
      },
      relationship,
    ],
  });
  await c.call("debrief_add", {
    session: competing.s.id,
    lastTime: "Competing commit.",
    changes: [relationship],
  });
  await c.call("debrief_commit", { session: competing.s.id });
  await expect(
    c.call("debrief_commit", { session: pending.s.id }),
  ).rejects.toThrow("Relationship already exists");
  expect(
    (await c.call("find", { types: ["entity"], kinds: ["thread"] })).hits,
  ).toEqual([]);
  const overview = await c.call("get", { ref: "overview" });
  expect(overview.commits).toHaveLength(3);
  expect(overview.lastTime).toBe("Competing commit.");
  const entity = await c.call("get", { ref: npc });
  expect(entity.history.map((h: { session: string }) => h.session)).toEqual([
    s.id,
    competing.s.id,
  ]);
  expect((await c.call("get", { ref: `debrief:${pending.s.id}` })).status).toBe(
    "draft",
  );
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

test("transcript and timestamp-window pages continue through repeated timestamps without gaps", async () => {
  const c = client();
  await c.init();
  await c.call("adventure_start", {
    name: "Lantern road",
    reason: "Invented pagination proof",
  });
  const s = await c.call("session_create", { playedOn: "2026-01-03" });
  const { url } = await c.call("transcript_upload_url", { session: s.id });
  const upload = await c.t.fetch(new URL(url).pathname + new URL(url).search, {
    method: "PUT",
    body: "[00:00:00] GM: First lantern.\n[00:00:00] Rowan: Second lantern.\n[00:00:30] Sera: Third lantern.\n[00:04:00] GM: Last lantern.",
  });
  expect(upload.status).toBe(200);
  const ref = `transcript:${s.id}`;
  const first = await c.call("get", { ref, limit: 2 });
  expect(first.utterances.map((u: { text: string }) => u.text)).toEqual([
    "First lantern.",
    "Second lantern.",
  ]);
  expect(first.truncated).toBe(true);
  expect(first.nextCursor).toEqual(expect.any(String));
  const last = await c.call("get", { ref, limit: 2, cursor: first.nextCursor });
  expect(last.utterances.map((u: { text: string }) => u.text)).toEqual([
    "Third lantern.",
    "Last lantern.",
  ]);
  expect(last.truncated).toBe(false);
  expect(last.nextCursor).toBeNull();
  const windowRef = `${ref}@00:00:20`;
  const window = await c.call("get", { ref: windowRef, limit: 2 });
  const windowEnd = await c.call("get", {
    ref: windowRef,
    limit: 2,
    cursor: window.nextCursor,
  });
  expect(windowEnd.utterances.map((u: { text: string }) => u.text)).toEqual([
    "Third lantern.",
  ]);
  expect(windowEnd.truncated).toBe(false);
  await expect(
    c.call("get", { ref: windowRef, cursor: first.nextCursor }),
  ).rejects.toThrow("Cursor");
});

test("entity history pages preserve every committed debrief with its basis and source", async () => {
  const { c, s } = await prepared();
  await c.call("debrief_add", {
    session: s.id,
    lastTime: "The ferry opens.",
    changes: [npcChange()],
  });
  await c.call("debrief_commit", { session: s.id });
  const ref = (await c.call("find", { types: ["entity"] })).hits[0].ref;
  const sessions = [s.id];
  for (let i = 1; i <= 3; i++) {
    const next = await prepared(c);
    sessions.push(next.s.id);
    await c.call("debrief_add", {
      session: next.s.id,
      lastTime: `The ferry advances ${i}.`,
      changes: [
        {
          ...npcChange(),
          change: {
            op: "update",
            entity: ref,
            properties: { knows: `Message ${i}` },
          },
          why: `Remember message ${i}`,
        },
      ],
    });
    await c.call("debrief_commit", { session: next.s.id });
  }
  const first = await c.call("get", { ref, limit: 2 });
  expect(first.history.map((h: { session: string }) => h.session)).toEqual(
    sessions.slice(0, 2),
  );
  expect(first.truncated).toBe(true);
  const second = await c.call("get", {
    ref,
    limit: 2,
    cursor: first.nextCursor,
  });
  expect(second.history.map((h: { session: string }) => h.session)).toEqual(
    sessions.slice(2),
  );
  expect(second.history.map((h: { why: string }) => h.why)).toEqual([
    "Remember message 2",
    "Remember message 3",
  ]);
  expect(second.history[0].basis).toEqual(["npc_said"]);
  expect(second.history[0].sources).toEqual([
    { quote: "Mind the stones, dear.", at: "00:01:10" },
  ]);
  expect(second.properties.knows).toBe("Message 3");
  expect(second.truncated).toBe(false);
  expect(second.nextCursor).toBeNull();
});

test("find continues past its old candidate cap and keeps utterances at the same timestamp distinct", async () => {
  const c = client();
  await c.init();
  await c.call("adventure_start", {
    name: "Lantern road",
    reason: "Invented search proof",
  });
  const s = await c.call("session_create", { playedOn: "2026-01-03" });
  const { url } = await c.call("transcript_upload_url", { session: s.id });
  const lines = Array.from(
    { length: 205 },
    (_, i) => `[00:00:00] GM: Lantern marker ${i}.`,
  );
  expect(
    (
      await c.t.fetch(new URL(url).pathname + new URL(url).search, {
        method: "PUT",
        body: lines.join("\n"),
      })
    ).status,
  ).toBe(200);
  const first = await c.call("find", {
    query: "lantern marker",
    types: ["transcript"],
    limit: 100,
  });
  expect(first.hits).toHaveLength(100);
  expect(first.truncated).toBe(true);
  expect(first.totalIsExact).toBe(false);
  const second = await c.call("find", {
    query: "lantern marker",
    types: ["transcript"],
    limit: 100,
    cursor: first.nextCursor,
  });
  const third = await c.call("find", {
    query: "lantern marker",
    types: ["transcript"],
    limit: 100,
    cursor: second.nextCursor,
  });
  expect(third.truncated).toBe(false);
  expect(third.nextCursor).toBeNull();
  expect(third.total).toBe(205);
  expect(third.totalIsExact).toBe(true);
  const hits = [...first.hits, ...second.hits, ...third.hits];
  expect(new Set(hits.map((h: { id: string }) => h.id)).size).toBe(205);
  expect(hits.map((h: { snippet: string }) => h.snippet)).toEqual(
    expect.arrayContaining(["Lantern marker 0.", "Lantern marker 204."]),
  );
  await expect(
    c.call("find", {
      query: "different",
      types: ["transcript"],
      cursor: first.nextCursor,
    }),
  ).rejects.toThrow("Cursor");
});

test("a four-hour transcript uploads, splits at its true end, and reads back completely through pages", async () => {
  const c = client();
  await c.init();
  await c.call("adventure_start", {
    name: "Lantern road",
    reason: "Invented four-hour proof",
  });
  const s = await c.call("session_create", { playedOn: "2026-01-03" });
  const fixture = longSession();
  const { url } = await c.call("transcript_upload_url", { session: s.id });
  const upload = await c.t.fetch(new URL(url).pathname + new URL(url).search, {
    method: "PUT",
    body: fixture.text,
  });
  expect(upload.status).toBe(200);
  await c.call("scenes_set", {
    session: s.id,
    scenes: [
      {
        title: "Causeway",
        start: "00:00:00",
        place: "Road",
        summary: "The party follows the river.",
      },
      {
        title: "Return",
        start: "03:59:30",
        end: "04:00:00",
        place: "Gate",
        summary: "The party returns at dawn.",
      },
    ],
  });
  const lines: unknown[] = [];
  let cursor: string | null = null;
  do {
    const page = await c.call("get", {
      ref: `transcript:${s.id}`,
      limit: 200,
      cursor,
    });
    lines.push(...page.utterances);
    expect(page.truncated).toBe(page.nextCursor !== null);
    cursor = page.nextCursor;
  } while (cursor);
  expect(lines).toEqual(fixture.utterances);
  const finalScene = await c.call("get", { ref: `scene:${s.id}/2` });
  expect(finalScene.utterances).toHaveLength(11);
  expect(finalScene.utterances.at(-1).text).toBe(
    "The party returns to the lantern gate at dawn.",
  );
  const first = await c.call("get", { ref: `transcript:${s.id}` });
  expect(
    await (await c.owner.fetch(new URL(first.downloadUrl).pathname)).text(),
  ).toBe(fixture.text);
});

test("scene pages follow their continuation without spilling into the next scene", async () => {
  const { c, s } = await prepared();
  const ref = `scene:${s.id}/1`;
  const first = await c.call("get", { ref, limit: 1 });
  expect(first.utterances).toHaveLength(1);
  expect(first.truncated).toBe(true);
  const second = await c.call("get", {
    ref,
    limit: 1,
    cursor: first.nextCursor,
  });
  expect(second.utterances[0].text).toBe("I bet she works for the raiders.");
  expect(second.truncated).toBe(false);
  expect(second.nextCursor).toBeNull();
});

test("more than 2000 changes to one entity remain reachable with distinct history and source hits", async () => {
  const { c, s } = await prepared();
  await c.call("debrief_add", {
    session: s.id,
    lastTime: "The ferry opens.",
    changes: [npcChange()],
  });
  await c.call("debrief_commit", { session: s.id });
  const ref = (await c.call("find", { types: ["entity"] })).hits[0].ref;
  for (const count of [500, 500, 500, 500, 4]) {
    const next = await prepared(c);
    const added = await c.call("debrief_add", {
      session: next.s.id,
      lastTime: "The ferry keeps its messages.",
      changes: Array.from({ length: count }, (_, i) => ({
        ...npcChange(),
        change: {
          op: "update",
          entity: ref,
          properties: { knows: `Message ${next.s.id}/${i}` },
        },
        sources: [{ quote: "A lantern message arrives." }],
        why: `Remember ${next.s.id}/${i}`,
      })),
    });
    expect(added.rejected).toEqual([]);
    await c.call("debrief_commit", { session: next.s.id });
  }
  const history: { why: string }[] = [];
  let cursor: string | null = null;
  do {
    const page = await c.call("get", { ref, cursor });
    history.push(...page.history);
    cursor = page.nextCursor;
  } while (cursor);
  expect(history).toHaveLength(2005);
  expect(new Set(history.map((h) => h.why)).size).toBe(2005);
  const hits: { id: string }[] = [];
  do {
    const page = await c.call("find", {
      query: "lantern",
      types: ["source"],
      limit: 200,
      cursor,
    });
    hits.push(...page.hits);
    cursor = page.nextCursor;
  } while (cursor);
  expect(hits).toHaveLength(2004);
  expect(new Set(hits.map((h) => h.id)).size).toBe(2004);
});

test("replacing a long transcript hides the old generation and invalidates its continuation", async () => {
  const c = client();
  await c.init();
  await c.call("adventure_start", {
    name: "Lantern road",
    reason: "Invented replacement proof",
  });
  const s = await c.call("session_create", { playedOn: "2026-01-03" });
  const first = await c.call("transcript_upload_url", { session: s.id });
  const oldBody = longSession().text;
  expect(
    (
      await c.t.fetch(new URL(first.url).pathname + new URL(first.url).search, {
        method: "PUT",
        body: oldBody,
      })
    ).status,
  ).toBe(200);
  const oldPage = await c.call("get", { ref: `transcript:${s.id}`, limit: 1 });
  expect(oldPage.truncated).toBe(true);
  const next = await c.call("transcript_upload_url", { session: s.id });
  expect(
    (
      await c.t.fetch(new URL(next.url).pathname + new URL(next.url).search, {
        method: "PUT",
        body: "[00:00:00] GM: Replacement.",
      })
    ).status,
  ).toBe(200);
  const now = await c.call("get", { ref: `transcript:${s.id}` });
  expect(now.utterances).toEqual([
    { at: "00:00:00", seconds: 0, speaker: "GM", text: "Replacement." },
  ]);
  expect(now.truncated).toBe(false);
  await expect(
    c.call("get", { ref: `transcript:${s.id}`, cursor: oldPage.nextCursor }),
  ).rejects.toThrow("Cursor");
  let cursor: string | null = null;
  do {
    const result = await c.call("find", {
      query: "lantern",
      types: ["transcript"],
      limit: 200,
      cursor,
    });
    expect(result.hits).toEqual([]);
    cursor = result.nextCursor;
  } while (cursor);
  expect(
    await (await c.owner.fetch(new URL(now.downloadUrl).pathname)).text(),
  ).toBe("[00:00:00] GM: Replacement.");
});
