import { expect, test } from "vitest";
import { client } from "./mcp-client";

async function campaign() {
  const c = client();
  await c.init();
  await c.call("adventure_start", {
    name: "The Amber Ferry",
    reason: "Invented secret proof",
  });
  await c.call("story_commit", {
    reason: "The table met Mira",
    changes: [
      {
        change: {
          op: "new",
          kind: "npc",
          name: "Mira",
          properties: { playedAs: "Quiet keeper" },
        },
        basis: ["narrated"],
        sources: [{ quote: "Mira waits by the ferry." }],
        why: "Remember the keeper",
      },
    ],
  });
  const ref = (await c.call("find", { query: "Mira", types: ["entity"] }))
    .hits[0].ref;
  return { c, ref };
}

test("secret writes and changes keep reasoned before/after history apart from entities and their history", async () => {
  const { c, ref } = await campaign();
  const entity = await c.call("get", { ref });
  const found = await c.call("find");
  const written = await c.call("secret_write", {
    op: "write",
    text: "Mira hid the amber seal.",
    about: [ref],
    reason: "My unplayed background",
  });
  expect(written.secret).toMatchObject({
    text: "Mira hid the amber seal.",
    about: [ref.slice(7)],
    status: "hidden",
  });
  expect(written.secret.id).toMatch(/^secret:/);
  const changed = await c.call("secret_write", {
    op: "change",
    secret: written.secret.id,
    text: "Mira gave the amber seal to her sister.",
    reason: "Change my plan",
  });
  const saved = await c.call("get", { ref: written.secret.id });
  expect(saved.history).toEqual([
    {
      commit: written.commit,
      op: "write",
      reason: "My unplayed background",
      before: null,
      after: written.secret,
    },
    {
      commit: changed.commit,
      op: "change",
      reason: "Change my plan",
      before: written.secret,
      after: changed.secret,
    },
  ]);
  expect((await c.call("get", { ref: "secrets" })).secrets).toEqual([
    changed.secret,
  ]);
  expect((await c.call("get", { ref: "overview" })).openSecrets).toBe(1);
  expect(await c.call("get", { ref })).toEqual(entity);
  expect(await c.call("find")).toEqual(found);
  expect(
    (await c.call("find", { query: "amber seal", types: ["entity", "source"] }))
      .hits,
  ).toEqual([]);
});

test("fix and drop append history and close secrets, and a fix needs a sourced game-master story commit", async () => {
  const { c, ref } = await campaign();
  const write = (text: string) =>
    c.call("secret_write", {
      op: "write",
      text,
      about: [ref],
      reason: "Unplayed background",
    });
  const fixed = await write("Mira hid the amber seal.");
  const discarded = await write("Mira serves the old queen.");
  await expect(
    c.call("secret_write", {
      op: "fix",
      secret: fixed.secret.id,
      reason: "Make this fixed truth",
    }),
  ).rejects.toThrow("story_commit");
  const story = await c.call("story_commit", {
    reason: "Declare Mira's background fixed",
    changes: [
      {
        change: {
          op: "update",
          entity: ref,
          properties: { knows: fixed.secret.text },
        },
        basis: ["game_master"],
        sources: [{ quote: fixed.secret.text }],
        why: "Declare the secret fixed",
      },
    ],
  });
  const fix = await c.call("secret_write", {
    op: "fix",
    secret: fixed.secret.id,
    storyCommit: story.commit,
    reason: "Make this fixed truth",
  });
  const drop = await c.call("secret_write", {
    op: "drop",
    secret: discarded.secret.id,
    reason: "Discard this plan",
  });
  for (const [written, result, op, status, reason] of [
    [fixed, fix, "fix", "fixed", "Make this fixed truth"],
    [discarded, drop, "drop", "dropped", "Discard this plan"],
  ] as const) {
    const read = await c.call("get", { ref: written.secret.id });
    expect(read.status).toBe(status);
    expect(read.history[1]).toEqual({
      commit: result.commit,
      op,
      reason,
      before: written.secret,
      after: result.secret,
    });
  }
  let cursor = null;
  do {
    const page = await c.call("get", { ref: "secrets", cursor });
    expect(page.secrets).toEqual([]);
    cursor = page.nextCursor;
  } while (cursor);
  expect((await c.call("get", { ref: "overview" })).openSecrets).toBe(0);
  const entity = await c.call("get", { ref });
  expect(entity.history).toHaveLength(2);
  expect(entity.history[1]).toMatchObject({
    commit: story.commit,
    basis: ["game_master"],
  });
  expect(
    entity.history.some((h: { commit: string }) =>
      [fix.commit, drop.commit].includes(h.commit),
    ),
  ).toBe(false);
});

test("secret writes isolate owners and reject invalid or oversized input without recording a commit", async () => {
  const { c, ref } = await campaign();
  const written = await c.call("secret_write", {
    op: "write",
    text: "Mira hid the amber seal.",
    reason: "My background",
  });
  const stranger = client("another-invented-gm", c.t);
  await stranger.init();
  await stranger.call("adventure_start", {
    name: "Other ferry",
    reason: "Other owner",
  });
  const otherStory = await stranger.call("story_commit", {
    reason: "Other owner's fact",
    changes: [
      {
        change: {
          op: "new",
          kind: "world_fact",
          name: "Other seal",
          properties: { statement: written.secret.text },
        },
        basis: ["game_master"],
        sources: [{ quote: written.secret.text }],
        why: "Other story",
      },
    ],
  });
  await expect(
    stranger.call("get", { ref: written.secret.id }),
  ).rejects.toThrow("Secret not found");
  for (const op of ["change", "fix", "drop"])
    await expect(
      stranger.call("secret_write", {
        op,
        secret: written.secret.id,
        ...(op === "change" ? { text: "Intrusion" } : {}),
        reason: "Wrong owner",
      }),
    ).rejects.toThrow("Secret not found");
  const before = await c.call("get", { ref: "overview" });
  const saved = await c.call("get", { ref: written.secret.id });
  for (const args of [
    { op: "write", text: " " },
    { op: "write" },
    { op: "write", text: "x", reason: " " },
    { op: "write", text: "x".repeat(16_001) },
    { op: "write", text: "界".repeat(5_334) },
    { op: "write", text: "x", reason: "x".repeat(2_001) },
    { op: "write", text: "x", about: Array(51).fill(ref) },
    { op: "write", text: "x", about: ["entity:missing"] },
    { op: "write", text: "x", about: [written.secret.id] },
    { op: "write", text: "x", secret: written.secret.id },
    { op: "change", secret: written.secret.id },
    { op: "change", secret: written.secret.id, text: " " },
    { op: "drop", secret: written.secret.id, text: "Smuggled edit" },
    { op: "fix", secret: written.secret.id, storyCommit: otherStory.commit },
    { op: "write", text: "x", storyCommit: otherStory.commit },
  ]) {
    await expect(
      c.call("secret_write", { reason: "Rejected input", ...args }),
    ).rejects.toThrow();
    expect(await c.call("get", { ref: written.secret.id })).toEqual(saved);
    expect(await c.call("get", { ref: "overview" })).toEqual(before);
  }
  await expect(
    stranger.call("secret_write", {
      op: "write",
      text: "Wrong link",
      about: [ref],
      reason: "Other owner",
    }),
  ).rejects.toThrow("Entity not found");
  const rumor = await c.call("story_commit", {
    reason: "An NPC's claim",
    changes: [
      {
        change: {
          op: "update",
          entity: ref,
          properties: { knows: written.secret.text },
        },
        basis: ["npc_said"],
        sources: [{ quote: written.secret.text }],
        why: "A claim",
      },
    ],
  });
  await expect(
    c.call("secret_write", {
      op: "fix",
      secret: written.secret.id,
      storyCommit: rumor.commit,
      reason: "Cannot fix from a claim",
    }),
  ).rejects.toThrow("game_master");
});

test("open-secret and secret-history pages are complete, bounded, and cursors cannot be moved to another read or owner", async () => {
  const { c } = await campaign();
  const written = await c.call("secret_write", {
    op: "write",
    text: "First background",
    reason: "First",
  });
  for (const text of ["Second background", "Third background"])
    await c.call("secret_write", { op: "write", text, reason: "More" });
  const seen: string[] = [];
  let cursor = null;
  do {
    const page = await c.call("get", { ref: "secrets", limit: 1, cursor });
    expect(page.secrets.length).toBeLessThanOrEqual(1);
    seen.push(...page.secrets.map((s: { text: string }) => s.text));
    cursor = page.nextCursor;
    expect(page.truncated).toBe(cursor !== null);
  } while (cursor);
  expect(seen.sort()).toEqual([
    "First background",
    "Second background",
    "Third background",
  ]);
  for (let i = 1; i <= 12; i++)
    await c.call("secret_write", {
      op: "change",
      secret: written.secret.id,
      text: `Changed background ${i}`,
      reason: `Revision ${i}`,
    });
  const first = await c.call("get", { ref: written.secret.id, limit: 200 });
  expect(first.history.length).toBeLessThanOrEqual(10);
  expect(first.truncated).toBe(true);
  const history = [...first.history];
  cursor = first.nextCursor;
  do {
    const page = await c.call("get", { ref: written.secret.id, cursor });
    history.push(...page.history);
    cursor = page.nextCursor;
  } while (cursor);
  expect(history.map((h) => h.reason)).toEqual([
    "First",
    ...Array.from({ length: 12 }, (_, i) => `Revision ${i + 1}`),
  ]);
  await expect(
    c.call("get", { ref: "secrets", cursor: first.nextCursor }),
  ).rejects.toThrow("Cursor does not belong");
  const stranger = client("another-gm", c.t);
  await stranger.init();
  await stranger.call("adventure_start", {
    name: "Other",
    reason: "Other owner",
  });
  const open = await c.call("get", { ref: "secrets", limit: 1 });
  await expect(
    stranger.call("get", { ref: "secrets", cursor: open.nextCursor }),
  ).rejects.toThrow("Cursor does not belong");
  for (const limit of [0, 201, 1.5])
    await expect(c.call("get", { ref: "secrets", limit })).rejects.toThrow(
      "limit",
    );
});

test("a near-limit secret can be declared fixed with a compact game-master source and its explicit secret ref", async () => {
  const { c, ref } = await campaign();
  const text = "Mira guards the amber seal. ".repeat(570);
  const written = await c.call("secret_write", {
    op: "write",
    text,
    about: [ref],
    reason: "An invented long background answer",
  });
  const story = await c.call("story_commit", {
    reason: "Declare the secret fixed",
    changes: [
      {
        change: {
          op: "update",
          entity: ref,
          properties: { knows: "Mira guards the amber seal." },
        },
        basis: ["game_master"],
        sources: [{ quote: "I declare this background fixed." }],
        why: `Declare ${written.secret.id} fixed`,
      },
    ],
  });
  const fixed = await c.call("secret_write", {
    op: "fix",
    secret: written.secret.id,
    storyCommit: story.commit,
    reason: "Make my background fixed truth",
  });
  expect(fixed.secret).toMatchObject({ text, status: "fixed" });
  expect(
    (await c.call("get", { ref: written.secret.id })).history[1],
  ).toMatchObject({
    op: "fix",
    before: { status: "hidden" },
    after: { status: "fixed" },
  });
  const overview = await c.call("get", { ref: "overview" });
  expect(overview.openSecrets).toBe(0);
  expect(overview.commits[0]).toMatchObject({
    id: fixed.commit,
    storyCommit: story.commit,
  });
});

test("secret and story commit refs are bounded before lookup without recording a write", async () => {
  const { c } = await campaign();
  const written = await c.call("secret_write", {
    op: "write",
    text: "Mira guards the seal.",
    reason: "Background",
  });
  const before = await c.call("get", { ref: "overview" });
  for (const args of [
    { op: "change", secret: "x".repeat(201), text: "Cannot write" },
    { op: "fix", secret: written.secret.id, storyCommit: "x".repeat(201) },
  ])
    await expect(
      c.call("secret_write", { ...args, reason: "Invalid ref" }),
    ).rejects.toThrow("200 bytes");
  expect(await c.call("get", { ref: "overview" })).toEqual(before);
});
