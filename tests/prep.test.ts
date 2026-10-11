import { expect, test } from "vitest";
import { client } from "./mcp-client";

const answer = (
  change: Record<string, unknown>,
  quote = "The keeper wants the seal returned.",
) => ({
  change,
  basis: ["game_master"],
  sources: [{ quote }],
  why: "Record the game master's plank answer",
});
async function campaign() {
  const c = client();
  await c.init();
  await c.call("adventure_start", {
    name: "The Amber Ferry",
    reason: "Invented prep",
  });
  return c;
}

test("a plank answer commits new entities, aliases and relationships together with sourced history outside a debrief", async () => {
  const c = await campaign();
  await c.call("frame_update", {
    reason: "My intent",
    fields: { goal: "Open the ferry" },
  });
  const before = await c.call("get", { ref: "overview" });
  const committed = await c.call("story_commit", {
    reason: "Answer the gap about the keeper",
    changes: [
      answer({
        op: "new",
        tempKey: "keeper",
        kind: "npc",
        name: "Mira",
        properties: { wants: "The seal returned" },
      }),
      answer({ op: "update", entity: "$keeper", addAliases: ["The keeper"] }),
      answer({
        op: "new",
        tempKey: "landing",
        kind: "place",
        name: "Amber Landing",
      }),
      answer({
        op: "relate",
        type: "last_seen_at",
        from: "$keeper",
        to: "$landing",
      }),
    ],
  });
  const found = await c.call("find", { query: "Mira", types: ["entity"] });
  const keeper = await c.call("get", { ref: found.hits[0].ref });
  expect(keeper.properties.wants).toBe("The seal returned");
  expect(keeper.aliases).toEqual(["The keeper"]);
  expect(keeper.relationships[0].type).toBe("last_seen_at");
  expect(keeper.history).toHaveLength(3);
  expect(keeper.history.map((h: { commit: string }) => h.commit)).toEqual([
    committed.commit,
    committed.commit,
    committed.commit,
  ]);
  expect(keeper.history[0]).toMatchObject({
    basis: ["game_master"],
    sources: [{ quote: "The keeper wants the seal returned." }],
    before: null,
  });
  expect(keeper.history[0]).not.toHaveProperty("session");
  expect(keeper.history[0]).not.toHaveProperty("scene");
  expect(keeper.history[1].before.aliases).toEqual([]);
  expect(keeper.history[1].after.aliases).toEqual(["The keeper"]);
  const after = await c.call("get", { ref: "overview" });
  expect(after.commits[0]).toMatchObject({
    id: committed.commit,
    kind: "story",
    reason: "Answer the gap about the keeper",
  });
  expect(after.frame).toEqual(before.frame);
  expect(after.sessions).toEqual(before.sessions);
  expect(after.lastTime).toEqual(before.lastTime);
});

test("a rejected story batch leaves state, relationships, sources and commit history unchanged", async () => {
  const c = await campaign();
  await c.call("story_commit", {
    reason: "Remember Mira",
    changes: [
      answer({
        op: "new",
        kind: "npc",
        name: "Mira",
        properties: { status: "alive" },
      }),
    ],
  });
  const found = await c.call("find", { query: "Mira", types: ["entity"] });
  const ref = found.hits[0].ref;
  const before = await c.call("get", { ref });
  const overview = await c.call("get", { ref: "overview" });
  await expect(
    c.call("story_commit", {
      reason: "Correct a mistake",
      changes: [
        answer({ op: "update", entity: ref, properties: { status: "gone" } }),
        answer({
          op: "new",
          tempKey: "place",
          kind: "place",
          name: "Unstored Landing",
        }),
        answer({ op: "relate", type: "last_seen_at", from: ref, to: "$place" }),
        answer({
          op: "update",
          entity: ref,
          properties: { status: "invisible" },
        }),
      ],
    }),
  ).rejects.toThrow(
    "Change 4: Allowed value for npc.status: alive, dead, gone, unknown",
  );
  expect(await c.call("get", { ref })).toEqual(before);
  expect(await c.call("get", { ref: "overview" })).toEqual(overview);
  expect(
    (await c.call("find", { query: "Unstored", types: ["entity", "source"] }))
      .hits,
  ).toEqual([]);
  await expect(
    c.call("story_commit", {
      reason: "Bad timestamp must roll back",
      changes: [
        answer({ op: "update", entity: ref, properties: { status: "gone" } }),
        {
          ...answer({
            op: "update",
            entity: ref,
            properties: { knows: "The broken seal" },
          }),
          sources: [{ quote: "The broken seal", at: "00:99:00" }],
        },
      ],
    }),
  ).rejects.toThrow("Invalid timestamp");
  expect(await c.call("get", { ref })).toEqual(before);
  expect(await c.call("get", { ref: "overview" })).toEqual(overview);
});

test.each([
  [
    "unknown kind",
    { change: { op: "new", kind: "dragon", name: "Invented" } },
    "Allowed kinds",
  ],
  [
    "unknown property",
    {
      change: {
        op: "new",
        kind: "npc",
        name: "Invented",
        properties: { secretPower: "fog" },
      },
    },
    "Allowed properties",
  ],
  [
    "wrong value type",
    {
      change: {
        op: "new",
        kind: "clock",
        name: "Invented",
        properties: { filled: "one" },
      },
    },
    "number",
  ],
  ["missing basis", { basis: [] }, "At least one basis"],
  ["missing source", { sources: [] }, "one non-empty source"],
  ["empty quote", { sources: [{ quote: " " }] }, "one non-empty source"],
  ["missing why", { why: " " }, "why"],
  [
    "guess on an NPC",
    { basis: ["player_guess", "player_plan"] },
    "only thread or character_goal",
  ],
  [
    "duplicate temp key",
    { change: { op: "new", kind: "npc", name: "Invented", tempKey: "first" } },
    "Duplicate tempKey",
  ],
  [
    "invalid relationship endpoints",
    {
      change: {
        op: "relate",
        type: "last_seen_at",
        from: "$first",
        to: "$first",
      },
    },
    "Allowed endpoints",
  ],
  [
    "unknown relationship",
    {
      change: { op: "relate", type: "invented", from: "$first", to: "$first" },
    },
    "Allowed relationship types",
  ],
  [
    "guess relationship touching an NPC",
    {
      change: { op: "relate", type: "involves", from: "$thread", to: "$first" },
      basis: ["player_guess"],
    },
    "only thread or character_goal",
  ],
  [
    "forward temp reference",
    {
      change: {
        op: "update",
        entity: "$later",
        properties: { status: "gone" },
      },
    },
    "Entity not found",
  ],
])(
  "story commits reject %s without keeping the earlier changes",
  async (_label, override, message) => {
    const c = await campaign();
    const before = await c.call("get", { ref: "overview" });
    await expect(
      c.call("story_commit", {
        reason: "An invented correction",
        changes: [
          answer({ op: "new", kind: "npc", name: "First", tempKey: "first" }),
          answer({
            op: "new",
            kind: "thread",
            name: "Open seal",
            tempKey: "thread",
          }),
          {
            ...answer({ op: "new", kind: "npc", name: "Invalid" }),
            ...override,
          },
        ],
      }),
    ).rejects.toThrow(message);
    expect((await c.call("find", { types: ["entity"] })).hits).toEqual([]);
    expect(await c.call("get", { ref: "overview" })).toEqual(before);
  },
);

test("story commits require a reason, changes and a bounded payload without writing", async () => {
  const c = await campaign();
  const before = await c.call("get", { ref: "overview" });
  const change = answer({ op: "new", kind: "npc", name: "Mira" });
  for (const [args, message] of [
    [{ reason: " ", changes: [change] }, "reason"],
    [{ reason: "Empty", changes: [] }, "at least one"],
    [
      {
        reason: "Too many",
        changes: Array.from({ length: 501 }, () => change),
      },
      "500",
    ],
    [
      {
        reason: "Too large",
        changes: [{ ...change, sources: [{ quote: "x".repeat(16_001) }] }],
      },
      "16 KB",
    ],
    [{ reason: "x".repeat(512_001), changes: [change] }, "512 KB"],
  ] as const) {
    await expect(c.call("story_commit", args)).rejects.toThrow(message);
    expect(await c.call("get", { ref: "overview" })).toEqual(before);
    expect((await c.call("find", { types: ["entity"] })).hits).toEqual([]);
  }
});

test("prep search returns separately ranked source claims with their basis and timestamped utterances that get can read", async () => {
  const c = await campaign();
  await c.call("story_commit", {
    reason: "Remember two distinct claims",
    changes: [
      {
        ...answer(
          { op: "new", tempKey: "mira", kind: "npc", name: "Mira" },
          "Mira claims the amber seal opens the ferry.",
        ),
        basis: ["npc_said"],
      },
      {
        ...answer(
          {
            op: "update",
            entity: "$mira",
            properties: { knows: "A rumor about the seal" },
          },
          "A rumor says the amber token is hollow.",
        ),
        basis: ["rumor"],
      },
    ],
  });
  const sources = await c.call("find", {
    query: "amber seal",
    types: ["source"],
  });
  expect(sources.hits).toHaveLength(2);
  expect(sources.hits[0].snippet).toContain(
    "Mira claims the amber seal opens the ferry.",
  );
  expect(sources.hits[0].score).toBeGreaterThan(sources.hits[1].score);
  expect(
    sources.hits.flatMap((h: { basis: string[] }) => h.basis).sort(),
  ).toEqual(["npc_said", "rumor"]);
  const page = await c.call("find", {
    query: "amber",
    types: ["source"],
    limit: 1,
  });
  expect(page.truncated).toBe(true);
  const next = await c.call("find", {
    query: "amber",
    types: ["source"],
    limit: 1,
    cursor: page.nextCursor,
  });
  expect(
    [...page.hits, ...next.hits]
      .flatMap((h: { basis: string[] }) => h.basis)
      .sort(),
  ).toEqual(["npc_said", "rumor"]);
  const entity = await c.call("get", { ref: sources.hits[0].ref });
  expect(entity.history.map((h: { basis: string[] }) => h.basis)).toEqual([
    ["npc_said"],
    ["rumor"],
  ]);
  const session = await c.call("session_create", { playedOn: "2026-01-03" });
  const { url } = await c.call("transcript_upload_url", {
    session: session.id,
  });
  const location = new URL(url);
  expect(
    (
      await c.t.fetch(location.pathname + location.search, {
        method: "PUT",
        body: "[00:00:00] GM: Start at the landing.\n[00:05:00] GM as Mira: The amber seal opens the ferry.\n[00:05:30] Rowan: An amber token?\n[00:10:00] GM: The bell rings.\n",
      })
    ).status,
  ).toBe(200);
  const transcript = await c.call("find", {
    query: "amber seal",
    types: ["transcript"],
  });
  expect(transcript.hits).toHaveLength(2);
  expect(transcript.hits[0].ref).toBe(`transcript:${session.id}@00:05:00`);
  expect(transcript.hits[0].score).toBeGreaterThan(transcript.hits[1].score);
  expect(transcript.hits.map((h: { ref: string }) => h.ref).sort()).toEqual([
    `transcript:${session.id}@00:05:00`,
    `transcript:${session.id}@00:05:30`,
  ]);
  const window = await c.call("get", {
    ref: `transcript:${session.id}@00:05:00`,
  });
  expect(window.utterances.map((u: { speaker: string }) => u.speaker)).toEqual([
    "GM as Mira",
    "Rowan",
  ]);
  expect(window.utterances[0].text).toBe("The amber seal opens the ferry.");
});

test("the client loads prep sparring and plank questions with their creative rules and the story write contract", async () => {
  const c = client();
  const init = await c.init();
  expect(init.result.instructions.length).toBeLessThan(4096);
  const list = await c.call("skill");
  expect(list.skills.map((s: { name: string }) => s.name)).toEqual(
    expect.arrayContaining(["prep-sparring", "plank-questions"]),
  );
  const prep = await c.call("skill", { name: "Prep sparring" });
  expect(prep.name).toBe("prep-sparring");
  expect(prep.procedure).toContain("checklist");
  expect(prep.procedure).toContain("One question");
  expect(prep.procedure).toContain("five short bullets");
  expect(prep.procedure).toContain("two or three");
  expect(prep.procedure).toContain("plank-questions");
  const plank = await c.call("skill", { name: "plank_questions" });
  expect(plank.name).toBe("plank-questions");
  expect(plank.procedure).toContain("story_commit");
  expect(plank.procedure).toContain("game_master");
  for (const skill of [prep, plank]) {
    expect(skill.procedure).toContain("Never draft prep");
    expect(skill.procedure).toContain("explicit request");
    expect(skill.procedure).toContain("never player decisions or outcomes");
    expect(skill.procedure).toContain("game master's language");
  }
  const tools = (await c.rpc("tools/list")).result.tools;
  const story = tools.find((t: { name: string }) => t.name === "story_commit");
  expect(story.description).toContain("All or nothing");
  expect(
    story.inputSchema.properties.changes.items.properties.basis.description,
  ).toContain("player_guess");
  expect(
    story.inputSchema.properties.changes.items.properties,
  ).not.toHaveProperty("scene");
  expect(story.outputSchema.properties.commit).toBeDefined();
});

test("a correction preserves the closed debrief and lastTime while changing current state, and another owner cannot correct it", async () => {
  const c = await campaign();
  const s = await c.call("session_create", { playedOn: "2026-01-03" });
  const { url } = await c.call("transcript_upload_url", { session: s.id });
  const location = new URL(url);
  await c.t.fetch(location.pathname + location.search, {
    method: "PUT",
    body: "[00:00:00] GM: Mira waits by the ferry.\n",
  });
  await c.call("scenes_set", {
    session: s.id,
    scenes: [
      {
        title: "Ferry",
        start: "00:00:00",
        place: "Amber Landing",
        summary: "Mira waits",
      },
    ],
  });
  await c.call("debrief_add", {
    session: s.id,
    lastTime: "At the ferry. Mira waits.",
    changes: [
      {
        scene: 1,
        ...answer({
          op: "new",
          kind: "npc",
          name: "Mira",
          properties: { status: "alive" },
        }),
      },
    ],
  });
  await c.call("debrief_commit", { session: s.id });
  const draft = await c.call("get", { ref: `debrief:${s.id}` });
  const session = await c.call("get", { ref: `session:${s.id}` });
  const { hits } = await c.call("find", { query: "Mira", types: ["entity"] });
  const ref = hits[0].ref;
  const stranger = client("another-invented-gm", c.t);
  await stranger.init();
  await stranger.call("adventure_start", {
    name: "Other ferry",
    reason: "Invented owner",
  });
  await expect(
    stranger.call("story_commit", {
      reason: "Wrong owner",
      changes: [
        answer({ op: "update", entity: ref, properties: { status: "dead" } }),
      ],
    }),
  ).rejects.toThrow("Entity not found");
  expect((await stranger.call("find", { query: "Mira" })).hits).toEqual([]);
  await c.call("story_commit", {
    reason: "Mira has left, not died",
    changes: [
      answer(
        { op: "update", entity: ref, properties: { status: "gone" } },
        "Mira has left, not died.",
      ),
    ],
  });
  const corrected = await c.call("get", { ref });
  expect(corrected.properties.status).toBe("gone");
  expect(corrected.history[0]).toMatchObject({ session: s.id, scene: 1 });
  expect(corrected.history[1]).toMatchObject({
    before: { properties: { status: "alive" } },
    after: { properties: { status: "gone" } },
  });
  expect(await c.call("get", { ref: `debrief:${s.id}` })).toEqual(draft);
  expect(await c.call("get", { ref: `session:${s.id}` })).toEqual(session);
  expect((await c.call("get", { ref: "overview" })).lastTime).toBe(
    "At the ferry. Mira waits.",
  );
  await expect(c.call("debrief_commit", { session: s.id })).rejects.toThrow(
    "committed",
  );
});

test("guesses stay on threads, mixed basis remains explicit and link corrections record both endpoints", async () => {
  const c = await campaign();
  await c.call("story_commit", {
    reason: "A sourced correction",
    changes: [
      {
        ...answer(
          {
            op: "new",
            tempKey: "thread",
            kind: "thread",
            name: "Where is the seal?",
            properties: { status: "open" },
          },
          "I think the seal is hidden.",
        ),
        basis: ["player_guess", "player_plan"],
      },
      {
        ...answer(
          { op: "new", tempKey: "mira", kind: "npc", name: "Mira" },
          "Mira says it is by the ferry; I confirm it.",
        ),
        basis: ["npc_said", "game_master"],
      },
      answer({ op: "relate", type: "involves", from: "$thread", to: "$mira" }),
    ],
  });
  const threadRef = (await c.call("find", { query: "seal", types: ["entity"] }))
    .hits[0].ref;
  const thread = await c.call("get", { ref: threadRef });
  expect(thread.history[0].basis).toEqual(["player_guess", "player_plan"]);
  const miraRef = (await c.call("find", { query: "Mira", types: ["entity"] }))
    .hits[0].ref;
  expect((await c.call("get", { ref: miraRef })).history[0].basis).toEqual([
    "npc_said",
    "game_master",
  ]);
  await c.call("story_commit", {
    reason: "Correct the link",
    changes: [
      answer({
        op: "unrelate",
        type: "involves",
        from: threadRef,
        to: miraRef,
      }),
    ],
  });
  for (const ref of [threadRef, miraRef]) {
    const entity = await c.call("get", { ref });
    expect(entity.relationships).toEqual([]);
    expect(entity.history.at(-1)).toMatchObject({
      before: { type: "involves" },
      after: null,
    });
  }
});

test("debrief changes and story corrections reject an empty source timestamp under the same rule", async () => {
  const c = await campaign();
  const session = await c.call("session_create", { playedOn: "2026-01-03" });
  const { url } = await c.call("transcript_upload_url", {
    session: session.id,
  });
  const path = new URL(url);
  await c.t.fetch(path.pathname + path.search, {
    method: "PUT",
    body: "[00:00:00] GM: Mira waits.\n",
  });
  await c.call("scenes_set", {
    session: session.id,
    scenes: [
      {
        title: "Mira",
        start: "00:00:00",
        place: "Landing",
        summary: "Mira waits",
      },
    ],
  });
  const invalid = {
    ...answer({ op: "new", kind: "npc", name: "Mira" }),
    sources: [{ quote: "Mira waits.", at: "" }],
  };
  const added = await c.call("debrief_add", {
    session: session.id,
    changes: [{ scene: 1, ...invalid }],
  });
  expect(added.draft.changes).toEqual([]);
  expect(added.rejected[0].reason).toContain("timestamp");
  await expect(
    c.call("story_commit", { reason: "Wrong timestamp", changes: [invalid] }),
  ).rejects.toThrow("timestamp");
});
