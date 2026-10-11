import { expect, test } from "vitest";
import { client, createTest } from "./mcp-client";

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
    "frame-talk",
    "map-speakers",
    "split-scenes",
    "debrief",
  ]);
  for (const name of [
    "map speakers",
    "split scenes",
    "DEBRIEF",
    "frame talk",
  ]) {
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
  ).rejects.toThrow(
    '"text":"Drop the dependent changes first: change Sera Venn (scene 1)."',
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
  await expect(c.call("get", { ref: "unsupported" })).rejects.toThrow(
    "Allowed refs",
  );
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
  expect(result.total).toBe(2);
  expect(result.hits[0].type).toBe("entity");
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

test("frame edits preserve omitted intent, append before and after with a reason, and leave the story state untouched", async () => {
  const { c, s } = await prepared();
  await c.call("debrief_add", {
    session: s.id,
    changes: [npcChange()],
    lastTime: "Sera waits by the ferry. The gate closes at dusk.",
  });
  await c.call("debrief_commit", { session: s.id });
  const found = await c.call("find", { types: ["entity"] });
  const npc = await c.call("get", { ref: found.hits[0].ref });
  const session = await c.call("get", { ref: `session:${s.id}` });
  await c.call("schema_change", {
    reason: "Remember a greeting",
    ops: [
      {
        op: "add_property",
        kind: "npc",
        key: "greeting",
        type: "text",
        description: "How this NPC greets visitors",
      },
    ],
  });
  const schema = await c.call("get", { ref: "schema" });
  const initial = {
    goal: "Restore passage",
    stakes: "The ferry village is cut off",
    timeframe: "Before dusk",
    pressure: "The closing gate",
    finale: "A cracked gate above the ferry",
    moves_main_plot: "Reveal the broken seal",
    pulls_in: "Sera's ferry",
    next_session_starts: "At the ferry landing",
  };
  await c.call("frame_update", {
    reason: "My intent for the causeway",
    fields: initial,
  });
  await c.call("frame_update", {
    reason: "The gate now closes sooner",
    fields: { timeframe: "Before the third bell" },
  });
  const frame = await c.call("get", { ref: "frame" });
  expect(frame.fields).toEqual({
    ...initial,
    timeframe: "Before the third bell",
  });
  expect(frame.history).toHaveLength(2);
  expect(frame.history[0]).toMatchObject({
    kind: "frame",
    reason: "My intent for the causeway",
    before: {},
    after: initial,
  });
  expect(frame.history[1]).toMatchObject({
    kind: "frame",
    reason: "The gate now closes sooner",
    before: initial,
    after: frame.fields,
  });
  const overview = await c.call("get", { ref: "overview" });
  expect(overview.frame.fields).toEqual(frame.fields);
  expect(overview.frame.adventure).toBe(overview.currentAdventure);
  expect(overview.lastTime).toBe(
    "Sera waits by the ferry. The gate closes at dusk.",
  );
  expect(
    overview.commits.filter(
      (commit: { kind: string }) => commit.kind === "frame",
    ),
  ).toHaveLength(2);
  expect(await c.call("find", { types: ["entity"] })).toEqual(found);
  expect(await c.call("get", { ref: found.hits[0].ref })).toEqual(npc);
  expect(await c.call("get", { ref: `session:${s.id}` })).toEqual(session);
  expect(await c.call("get", { ref: "schema" })).toEqual(schema);
  await c.call("frame_update", {
    reason: "Leave the timeframe open",
    fields: { timeframe: "" },
  });
  const cleared = await c.call("get", { ref: "frame" });
  expect(cleared.fields).toEqual({ ...initial, timeframe: "" });
  expect(cleared.history[2]).toMatchObject({
    reason: "Leave the timeframe open",
    before: frame.fields,
    after: cleared.fields,
  });
});

test("frame updates reject missing intent and keep each adventure and owner separate", async () => {
  const shared = createTest();
  const c = client("first-gm", shared);
  await c.init();
  await expect(
    c.call("frame_update", {
      reason: "First intent",
      fields: { goal: "Open the gate" },
    }),
  ).rejects.toThrow("adventure_start");
  await c.call("adventure_start", { name: "The Causeway", reason: "Arrived" });
  await c.call("frame_update", {
    reason: "First intent",
    fields: { goal: "Open the gate" },
  });
  const firstFrame = await c.call("get", { ref: "frame" });
  await expect(
    c.call("frame_update", { reason: "  ", fields: { goal: "Changed" } }),
  ).rejects.toThrow("reason");
  await expect(
    c.call("frame_update", { reason: "No change", fields: {} }),
  ).rejects.toThrow("field");
  await expect(
    c.call("frame_update", {
      reason: "Invented field",
      fields: { outcome: "The party wins" },
    }),
  ).rejects.toThrow("Tool execution failed");
  expect(await c.call("get", { ref: "frame" })).toEqual(firstFrame);
  const other = client("second-gm", shared);
  await other.init();
  await other.call("adventure_start", {
    name: "The Orchard",
    reason: "Arrived",
  });
  await other.call("frame_update", {
    reason: "Own intent",
    fields: { goal: "Save the orchard" },
  });
  expect((await other.call("get", { ref: "frame" })).fields).toEqual({
    goal: "Save the orchard",
  });
  expect(await c.call("get", { ref: "frame" })).toEqual(firstFrame);
  await c.call("adventure_start", {
    name: "The Red Tower",
    reason: "Next adventure",
  });
  expect(await c.call("get", { ref: "frame" })).toMatchObject({
    name: "The Red Tower",
    fields: {},
    history: [],
  });
  await c.call("frame_update", {
    reason: "Tower intent",
    fields: { goal: "Reach the roof" },
  });
  expect((await c.call("get", { ref: "frame" })).history).toHaveLength(1);
});

test("the frame-talk skill reaches clients with grounded questions, a stopping rule and separate intent", async () => {
  const c = client();
  await c.init();
  const listed = await c.call("skill");
  expect(listed.skills.map((skill: { name: string }) => skill.name)).toContain(
    "frame-talk",
  );
  const loaded = await c.call("skill", { name: "Frame Talk" });
  expect(loaded.name).toBe("frame-talk");
  for (const text of [
    "get overview",
    "get frame",
    "One question at a time",
    "why",
    "goal, stakes, and timeframe",
    "satisfied",
    "last session put in question",
    "frame_update",
    "never outcomes",
    "Standing rules",
  ])
    expect(loaded.procedure).toContain(text);
  const tools = await c.rpc("tools/list");
  const frameTool = tools.result.tools.find(
    (tool: { name: string }) => tool.name === "frame_update",
  );
  expect(frameTool.inputSchema.properties.fields.additionalProperties).toBe(
    false,
  );
  expect(
    Object.keys(frameTool.inputSchema.properties.fields.properties),
  ).toEqual([
    "goal",
    "stakes",
    "timeframe",
    "pressure",
    "finale",
    "moves_main_plot",
    "pulls_in",
    "next_session_starts",
  ]);
  expect(
    tools.result.tools.find(
      (tool: { name: string }) => tool.name === "frame_update",
    ).description,
  ).toContain("never touches story state");
});

test("frame history never displaces the latest debrief from overview", async () => {
  const { c, s } = await prepared();
  await c.call("debrief_add", {
    session: s.id,
    changes: [npcChange()],
    lastTime: "Sera waits by the ferry.",
  });
  await c.call("debrief_commit", { session: s.id });
  for (let i = 0; i < 201; i++)
    await c.call("frame_update", {
      reason: "Revise intent",
      fields: { timeframe: `Bell ${i}` },
    });
  expect((await c.call("get", { ref: "overview" })).lastTime).toBe(
    "Sera waits by the ferry.",
  );
});
test("a deliberate property addition is immediately usable and recorded with its reason", async () => {
  const { c, s } = await prepared();
  const ops = [
    {
      op: "add_property",
      kind: "npc",
      key: "manner",
      type: "text",
      description: "How the NPC greets strangers",
    },
  ];
  const changed = await c.call("schema_change", {
    reason: "Remember greetings at the game master's request",
    ops,
  });
  expect(changed.schema.kinds.npc.manner).toBe("text");
  const added = await c.call("debrief_add", {
    session: s.id,
    lastTime: "At the ferry.",
    changes: [
      {
        ...npcChange(),
        change: {
          ...npcChange().change,
          properties: { manner: "Bows before speaking" },
        },
      },
    ],
  });
  expect(added.rejected).toEqual([]);
  await c.call("debrief_commit", { session: s.id });
  const ref = (await c.call("find", { types: ["entity"], kinds: ["npc"] }))
    .hits[0].ref;
  expect((await c.call("get", { ref })).properties.manner).toBe(
    "Bows before speaking",
  );
  const entry = (await c.call("get", { ref: "overview" })).commits.find(
    (entry: { id: string }) => entry.id === changed.commit,
  );
  expect(entry.kind).toBe("schema");
  expect(entry.reason).toBe("Remember greetings at the game master's request");
  expect(entry.schemaChange.ops).toEqual(ops);
  expect(entry.schemaChange.before.kinds.npc.manner).toBeUndefined();
  expect(entry.schemaChange.after.kinds.npc.manner).toBe("text");
});

test("retiring a property rejects new writes and pending commits while preserving old records", async () => {
  const { c, s } = await prepared();
  await c.call("debrief_add", {
    session: s.id,
    lastTime: "At the ferry.",
    changes: [npcChange()],
  });
  await c.call("debrief_commit", { session: s.id });
  const ref = (await c.call("find", { types: ["entity"] })).hits[0].ref;
  const original = await c.call("get", { ref });
  const pending = await prepared(c);
  await c.call("debrief_add", {
    session: pending.s.id,
    lastTime: "Pending voice.",
    changes: [
      {
        ...npcChange(),
        change: {
          op: "update",
          entity: ref,
          properties: { playedAs: "Whispers" },
        },
      },
    ],
  });
  const retired = await c.call("schema_change", {
    reason: "The game master no longer records voices",
    ops: [{ op: "retire_property", kind: "npc", key: "playedAs" }],
  });
  expect(retired.schema.kinds.npc.playedAs).toBeUndefined();
  expect(retired.schema.retiredProperties.npc.playedAs).toBe("text");
  expect(await c.call("get", { ref })).toEqual(original);
  await expect(
    c.call("debrief_commit", { session: pending.s.id }),
  ).rejects.toThrow("Allowed properties");
  await c.call("debrief_drop", { session: pending.s.id, changeIds: ["c1"] });
  const added = await c.call("debrief_add", {
    session: pending.s.id,
    lastTime: "Role kept; old voice remains.",
    changes: [
      npcChange("New NPC"),
      {
        ...npcChange(),
        change: {
          op: "update",
          entity: ref,
          properties: { playedAs: "Whispers" },
        },
      },
      {
        ...npcChange(),
        change: {
          op: "update",
          entity: ref,
          properties: { role: "Ferry keeper" },
        },
      },
    ],
  });
  expect(added.rejected.map((r: { index: number }) => r.index)).toEqual([0, 1]);
  expect(added.rejected[0].reason).toContain("Allowed properties");
  expect(added.rejected[0].reason).not.toContain("playedAs");
  await c.call("debrief_commit", { session: pending.s.id });
  const updated = await c.call("get", { ref });
  expect(updated.properties).toEqual({
    playedAs: "Softly, with a snapped final word",
    role: "Ferry keeper",
  });
  expect(updated.history[0]).toEqual(original.history[0]);
  const history = (await c.call("get", { ref: "overview" })).commits.find(
    (entry: { id: string }) => entry.id === retired.commit,
  );
  expect(history.reason).toBe("The game master no longer records voices");
  expect(history.schemaChange.ops).toEqual([
    { op: "retire_property", kind: "npc", key: "playedAs" },
  ]);
});

test("a deliberate relationship type is usable with its labels and allowed endpoints", async () => {
  const { c, s } = await prepared();
  const ops = [
    {
      op: "add_relationship_type",
      type: "mentors",
      from: ["npc"],
      to: ["player_character"],
      label: "mentors",
      inverseLabel: "mentored by",
      description: "Who taught the character",
    },
  ];
  const changed = await c.call("schema_change", {
    reason: "The game master wants to remember teachers",
    ops,
  });
  const added = await c.call("debrief_add", {
    session: s.id,
    lastTime: "Sera mentors Rowan.",
    changes: [
      npcChange(),
      {
        ...npcChange(),
        change: {
          op: "new",
          tempKey: "rowan",
          kind: "player_character",
          name: "Rowan",
        },
      },
      {
        ...npcChange(),
        change: { op: "relate", type: "mentors", from: "$sera", to: "$rowan" },
      },
      {
        ...npcChange(),
        change: { op: "relate", type: "mentors", from: "$rowan", to: "$sera" },
      },
    ],
  });
  expect(added.rejected).toHaveLength(1);
  expect(added.rejected[0].reason).toContain(
    "Allowed endpoints for mentors: npc -> player_character",
  );
  await c.call("debrief_commit", { session: s.id });
  const found = await c.call("find", {
    types: ["entity"],
    kinds: ["player_character"],
  });
  const rowan = await c.call("get", { ref: found.hits[0].ref });
  expect(rowan.relationships).toEqual([
    expect.objectContaining({
      type: "mentors",
      label: "mentors",
      inverseLabel: "mentored by",
      to: rowan.id,
    }),
  ]);
  expect(rowan.history).toHaveLength(2);
  const entry = (await c.call("get", { ref: "overview" })).commits.find(
    (entry: { id: string }) => entry.id === changed.commit,
  );
  expect(entry.reason).toBe("The game master wants to remember teachers");
  expect(entry.schemaChange.ops).toEqual(ops);
});

test("retired property names cannot be reused for a different definition", async () => {
  const { c } = await prepared();
  await c.call("schema_change", {
    reason: "Retire the old voice field",
    ops: [{ op: "retire_property", kind: "npc", key: "playedAs" }],
  });
  const before = await c.call("get", { refs: ["schema", "overview"] });
  await expect(
    c.call("schema_change", {
      reason: "Try to reuse it",
      ops: [
        {
          op: "add_property",
          kind: "npc",
          key: "playedAs",
          type: "number",
          description: "Different meaning",
        },
      ],
    }),
  ).rejects.toThrow("retired");
  expect(await c.call("get", { refs: ["schema", "overview"] })).toEqual(before);
});

test("schema operations reject invalid definitions atomically and cannot borrow prototype names", async () => {
  const { c } = await prepared();
  const before = await c.call("get", { refs: ["schema", "overview"] });
  const property = {
    op: "add_property",
    kind: "npc",
    key: "greeting",
    type: "text",
    description: "Greeting",
  };
  const invalid = [
    { ...property, key: "constructor" },
    { ...property, key: "name" },
    { ...property, key: "mood", type: "enum", enumValues: ["calm", "calm"] },
    { ...property, key: "mood", type: "enum", enumValues: [" "] },
    { ...property, key: "mood", type: "enum", enumValues: [] },
    { ...property, key: "mood", enumValues: ["calm"] },
    { ...property, key: " ", description: "Blank" },
    { ...property, key: "valid", description: " " },
    { ...property, kind: "new_kind" },
    { op: "retire_property", kind: "npc", key: "missing" },
    {
      op: "add_relationship_type",
      type: "constructor",
      from: ["npc"],
      to: ["place"],
      label: "here",
      inverseLabel: "there",
      description: "Invalid name",
    },
    {
      op: "add_relationship_type",
      type: "visits",
      from: ["npc"],
      to: ["new_kind"],
      label: "visits",
      inverseLabel: "visited by",
      description: "Unknown endpoint",
    },
  ];
  for (const op of invalid) {
    await expect(
      c.call("schema_change", {
        reason: "Invented invalid definition",
        ops: [property, op],
      }),
    ).rejects.toThrow();
    expect(await c.call("get", { refs: ["schema", "overview"] })).toEqual(
      before,
    );
  }
  await expect(
    c.call("schema_change", { reason: " ", ops: [property] }),
  ).rejects.toThrow("reason");
  await expect(
    c.call("schema_change", { reason: "No operations", ops: [] }),
  ).rejects.toThrow("operation");
});

test("schema additions validate enum and number writes and remain private to the caller", async () => {
  const { c, s } = await prepared();
  const other = client("other-invented-gm", c.t);
  await other.init();
  await other.call("adventure_start", {
    name: "Other campaign",
    reason: "Owner isolation proof",
  });
  await c.call("schema_change", {
    reason: "Track patience on the game master's request",
    ops: [
      {
        op: "add_property",
        kind: "npc",
        key: "patience",
        type: "number",
        description: "Story clock for patience",
      },
      {
        op: "add_property",
        kind: "npc",
        key: "mood",
        type: "enum",
        enumValues: ["calm", "uneasy"],
        description: "Mood in the scene",
      },
    ],
  });
  expect(
    (await other.call("get", { ref: "schema" })).kinds.npc.patience,
  ).toBeUndefined();
  expect(
    (await other.call("get", { ref: "overview" })).commits.map(
      (entry: { kind: string }) => entry.kind,
    ),
  ).toEqual(["seed"]);
  const added = await c.call("debrief_add", {
    session: s.id,
    lastTime: "Sera is uneasy.",
    changes: [
      {
        ...npcChange(),
        change: {
          ...npcChange().change,
          properties: { patience: 3, mood: "uneasy" },
        },
      },
      {
        ...npcChange(),
        change: {
          op: "update",
          entity: "$sera",
          properties: { mood: "angry" },
        },
      },
      {
        ...npcChange(),
        change: {
          op: "update",
          entity: "$sera",
          properties: { patience: "three" },
        },
      },
    ],
  });
  expect(added.rejected.map((r: { index: number }) => r.index)).toEqual([1, 2]);
  expect(added.rejected[0].reason).toContain("calm, uneasy");
  expect(added.rejected[1].reason).toContain("number");
  await c.call("debrief_commit", { session: s.id });
  const ref = (await c.call("find", { types: ["entity"] })).hits[0].ref;
  expect((await c.call("get", { ref })).properties).toEqual({
    patience: 3,
    mood: "uneasy",
  });
  const listed = await c.rpc("tools/list");
  const tool = listed.result.tools.find(
    (tool: { name: string }) => tool.name === "schema_change",
  );
  expect(tool.description).toContain("explicit request");
  expect(tool.inputSchema.properties.caller).toBeUndefined();
  expect(tool.outputSchema.type).toBe("object");
});

test("oversized schema changes fail without altering the definitions or history", async () => {
  const { c } = await prepared();
  const before = await c.call("get", { refs: ["schema", "overview"] });
  await expect(
    c.call("schema_change", {
      reason: "Invented size proof",
      ops: [
        {
          op: "add_property",
          kind: "npc",
          key: "greeting",
          type: "text",
          description: "x".repeat(33000),
        },
      ],
    }),
  ).rejects.toThrow("32 KB");
  expect(await c.call("get", { refs: ["schema", "overview"] })).toEqual(before);
});

test("a retirement-invalidated draft names the pending change and the repair in every write error", async () => {
  const { c, s } = await prepared();
  await c.call("debrief_add", {
    session: s.id,
    lastTime: "At the ferry.",
    changes: [
      npcChange(),
      {
        ...npcChange(),
        change: { op: "new", kind: "thread", name: "The ferry crossing" },
      },
    ],
  });
  await c.call("schema_change", {
    reason: "Stop recording voices",
    ops: [{ op: "retire_property", kind: "npc", key: "playedAs" }],
  });
  const before = await c.call("get", { ref: `debrief:${s.id}` });
  await expect(
    c.call("debrief_add", {
      session: s.id,
      changes: [
        {
          ...npcChange(),
          change: { op: "new", kind: "place", name: "Ferry landing" },
        },
      ],
    }),
  ).rejects.toThrow("Pending change c1");
  await expect(c.call("debrief_commit", { session: s.id })).rejects.toThrow(
    "debrief_drop",
  );
  await expect(
    c.call("debrief_drop", { session: s.id, changeIds: ["c2"] }),
  ).rejects.toThrow("invalid remaining changes: c1");
  expect(await c.call("get", { ref: `debrief:${s.id}` })).toEqual(before);
  await c.call("debrief_drop", { session: s.id, changeIds: ["c1"] });
  const accepted = await c.call("debrief_add", {
    session: s.id,
    changes: [
      {
        ...npcChange(),
        change: { op: "new", kind: "place", name: "Ferry landing" },
      },
    ],
  });
  expect(accepted.rejected).toEqual([]);
  await c.call("debrief_commit", { session: s.id });
});

test("overview recalls the last debrief after more schema commits than its recent-history window", async () => {
  const { c, s } = await prepared();
  await c.call("debrief_add", {
    session: s.id,
    lastTime: "The ferry awaits at dusk.",
    changes: [npcChange()],
  });
  await c.call("debrief_commit", { session: s.id });
  for (let i = 0; i < 200; i++) {
    await c.call("schema_change", {
      reason: "Invented recent-history capacity proof",
      ops: [
        {
          op: "add_property",
          kind: "npc",
          key: `note${i}`,
          type: "text",
          description: "Invented story note",
        },
      ],
    });
  }
  const overview = await c.call("get", { ref: "overview" });
  expect(overview.commits).toHaveLength(200);
  expect(
    overview.commits.every(
      (entry: { kind: string }) => entry.kind === "schema",
    ),
  ).toBe(true);
  expect(overview.lastTime).toBe("The ferry awaits at dusk.");
}, 30000);

test("the Ledger view is served as an MCP Apps resource that debrief_add and debrief_drop carry", async () => {
  const c = client();
  await c.init();
  const ledger = "ui://omni-gm/draft-debrief";
  const listed = await c.rpc("resources/list");
  expect(listed.result.resources).toContainEqual(
    expect.objectContaining({
      uri: ledger,
      mimeType: "text/html;profile=mcp-app",
    }),
  );
  const read = await c.rpc("resources/read", { uri: ledger });
  expect(read.result.contents).toEqual([
    expect.objectContaining({
      uri: ledger,
      mimeType: "text/html;profile=mcp-app",
    }),
  ]);
  expect(read.result.contents[0].text).toMatch(/^<!doctype html>/i);
  const tools = (await c.rpc("tools/list")).result.tools;
  for (const name of ["debrief_add", "debrief_drop"])
    expect(tools.find((t: { name: string }) => t.name === name)._meta).toEqual({
      ui: { resourceUri: ledger },
    });
});

test("debrief_add and debrief_drop return Ledger rows with label, subject, before and after per scene, listing only the aliases each change adds", async () => {
  const { c, s } = await prepared();
  const thread = {
    ...npcChange(),
    change: {
      op: "new",
      tempKey: "raiders",
      kind: "thread",
      name: "Who pays the raiders?",
      properties: { status: "open" },
    },
    basis: ["narrated"],
  };
  const added = await c.call("debrief_add", {
    session: s.id,
    lastTime: "At dusk by the ferry.",
    changes: [
      npcChange(),
      thread,
      {
        ...thread,
        change: {
          op: "relate",
          type: "raised_by",
          from: "$raiders",
          to: "$sera",
        },
      },
      {
        ...npcChange(),
        change: {
          op: "update",
          entity: "$sera",
          properties: { wants: "Safe passage home" },
          addAliases: ["Sera of the Ferry"],
        },
      },
      {
        ...thread,
        change: {
          op: "update",
          entity: "$raiders",
          properties: { status: "closed" },
        },
      },
    ],
  });
  expect(added.rejected).toEqual([]);
  const [sera, raiders, link, wants, closed] = added.draft.changes.map(
    (p: { id: string }) => p.id,
  );
  expect(added.ledger).toEqual({
    scenes: [{ ordinal: 1, title: "The ferry", place: "Glass Causeway" }],
    rows: [
      {
        id: sera,
        label: "new",
        subject: "Sera Venn",
        kind: "npc",
        before: {},
        after: {
          aliases: "Sarah Ven",
          playedAs: "Softly, with a snapped final word",
        },
      },
      {
        id: raiders,
        label: "new",
        subject: "Who pays the raiders?",
        kind: "thread",
        before: {},
        after: { status: "open" },
      },
      {
        id: link,
        label: "link",
        subject: "Who pays the raiders? raised by Sera Venn",
        before: {},
        after: {},
      },
      {
        id: wants,
        label: "change",
        subject: "Sera Venn",
        kind: "npc",
        before: {},
        after: {
          wants: "Safe passage home",
          addAliases: "Sera of the Ferry",
        },
      },
      {
        id: closed,
        label: "closed",
        subject: "Who pays the raiders?",
        kind: "thread",
        before: { status: "open" },
        after: { status: "closed" },
      },
    ],
  });
  const dropped = await c.call("debrief_drop", {
    session: s.id,
    changeIds: [closed],
  });
  expect(dropped.draft.changes.map((p: { id: string }) => p.id)).toEqual([
    sera,
    raiders,
    link,
    wants,
  ]);
  expect(dropped.ledger.rows.map((r: { id: string }) => r.id)).toEqual([
    sera,
    raiders,
    link,
    wants,
  ]);
  expect(dropped.ledger.scenes).toEqual(added.ledger.scenes);
  const more = await c.call("debrief_add", {
    session: s.id,
    changes: [
      {
        ...npcChange(),
        change: { op: "update", entity: "$sera", addAliases: ["Ferry Sera"] },
      },
    ],
  });
  expect(more.ledger.rows.at(-1)).toMatchObject({
    before: {},
    after: { addAliases: "Ferry Sera" },
  });
});
