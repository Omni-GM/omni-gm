import { expect, test } from "vitest";
import { client } from "./mcp-client";

const briefing = `Where the party stands
On the salt road at dusk [00:01:10].

What next
1. Go to the first checklist section (recommended).`;

async function debriefWithSecrets(c = client()) {
  await c.init();
  await c.call("adventure_start", {
    name: "The Salt Road",
    reason: "Invented reveal proof",
  });
  const s = await c.call("session_create", { playedOn: "2026-02-07" });
  const { url } = await c.call("transcript_upload_url", { session: s.id });
  await c.t.fetch(new URL(url).pathname + new URL(url).search, {
    method: "PUT",
    body: [
      "[00:01:10] GM as Tobin Marsh: The toll was raised by the abbess herself.",
      "[00:02:20] Ilse: So the abbey owns the road now?",
      "[00:03:30] GM: Behind the altar you find a ledger stamped with a heron.",
      "",
    ].join("\n"),
  });
  await c.call("scenes_set", {
    session: s.id,
    scenes: [
      {
        title: "The toll gate",
        start: "00:01:10",
        place: "Salt road",
        summary: "Tobin names the abbess.",
      },
      {
        title: "The abbey",
        start: "00:03:30",
        place: "Abbey of the Heron",
        summary: "The party finds the ledger.",
      },
    ],
  });
  const write = async (text: string) =>
    (
      await c.call("secret_write", {
        op: "write",
        text,
        reason: "My unplayed background",
      })
    ).secret;
  const abbess = await write(
    "The abbess raised the toll to pay the Heron smugglers, who hold her brother.",
  );
  const ledger = await write(
    "The heron ledger lists every bribed toll-keeper.",
  );
  return { c, session: s.id as string, abbess, ledger };
}

async function openSecrets(c: ReturnType<typeof client>) {
  const secrets = [];
  let cursor = null;
  do {
    const page = await c.call("get", { ref: "secrets", cursor });
    secrets.push(...page.secrets);
    cursor = page.nextCursor;
  } while (cursor);
  return secrets;
}

const tobinNamesTheAbbess = {
  scene: 1,
  change: {
    op: "new",
    kind: "world_fact",
    name: "The abbess raised the toll",
    properties: { statement: "The abbess raised the salt road toll." },
  },
  basis: ["npc_said"],
  sources: [
    {
      quote: "The toll was raised by the abbess herself.",
      at: "00:01:10",
    },
  ],
  why: "Tobin Marsh named who raised the toll",
};

test("a debrief commit reveals one secret whole and one in part, with history, next to its story changes", async () => {
  const { c, session, abbess, ledger } = await debriefWithSecrets();
  const tollSource = {
    quote: "The toll was raised by the abbess herself.",
    at: "00:01:10",
  };
  const ledgerSource = {
    quote: "Behind the altar you find a ledger stamped with a heron.",
    at: "00:03:30",
  };
  const added = await c.call("debrief_add", {
    session,
    briefing,
    changes: [tobinNamesTheAbbess],
    reveals: [
      {
        secret: abbess.id,
        scene: 1,
        learned: "The abbess raised the toll.",
        sources: [tollSource],
        whole: false,
      },
      {
        secret: ledger.id,
        scene: 2,
        learned: "The heron ledger lists every bribed toll-keeper.",
        sources: [ledgerSource],
        whole: true,
      },
    ],
  });
  expect(added.rejectedReveals).toEqual([]);
  expect(
    (await c.call("get", { ref: `debrief:${session}` })).reveals,
  ).toMatchObject([
    { secret: abbess.id, scene: 1, whole: false },
    { secret: ledger.id, scene: 2, whole: true },
  ]);

  const { commit } = await c.call("debrief_commit", { session });

  expect(await openSecrets(c)).toEqual([
    { ...abbess, status: "partly_revealed" },
  ]);
  expect((await c.call("get", { ref: "overview" })).openSecrets).toBe(1);
  expect((await c.call("get", { ref: abbess.id })).history[1]).toEqual({
    commit,
    op: "reveal",
    reason: "Partly revealed at the table",
    before: abbess,
    after: { ...abbess, status: "partly_revealed" },
    session,
    scene: 1,
    learned: "The abbess raised the toll.",
    sources: [tollSource],
  });
  const closed = await c.call("get", { ref: ledger.id });
  expect(closed.status).toBe("revealed");
  expect(closed.history[1]).toEqual({
    commit,
    op: "reveal",
    reason: "Revealed at the table",
    before: ledger,
    after: { ...ledger, status: "revealed" },
    session,
    scene: 2,
    learned: "The heron ledger lists every bribed toll-keeper.",
    sources: [ledgerSource],
  });
  const fact = (await c.call("find", { query: "abbess", types: ["entity"] }))
    .hits[0];
  expect((await c.call("get", { ref: fact.ref })).history[0].commit).toBe(
    commit,
  );
});

test("a reveal of an unknown, dropped, or other owner's secret is rejected and leaves the draft as it was", async () => {
  const { c, session, abbess, ledger } = await debriefWithSecrets();
  const rival = client("invented-rival-gm", c.t);
  await rival.init();
  await rival.call("adventure_start", {
    name: "The Rival Road",
    reason: "Invented second owner",
  });
  const theirs = (
    await rival.call("secret_write", {
      op: "write",
      text: "The rival's ferryman is a spy.",
      reason: "Their background",
    })
  ).secret;
  await c.call("secret_write", {
    op: "drop",
    secret: ledger.id,
    reason: "I discard the ledger",
  });
  const revealOf = (secret: string) => ({
    secret,
    scene: 1,
    learned: "Something the table saw.",
    sources: [{ quote: "The toll was raised by the abbess herself." }],
    whole: true,
  });
  const added = await c.call("debrief_add", {
    session,
    briefing,
    changes: [],
    reveals: [
      revealOf("secret:invented-unknown"),
      revealOf(ledger.id),
      revealOf(theirs.id),
      revealOf(abbess.id),
      revealOf(abbess.id),
    ],
  });
  expect(added.rejectedReveals).toEqual([
    { index: 0, reason: "Secret not found" },
    {
      index: 1,
      reason: "Only a hidden or partly revealed secret can be revealed",
    },
    { index: 2, reason: "Secret not found" },
    { index: 4, reason: "This secret already has a reveal in this draft" },
  ]);
  expect(added.draft.reveals).toMatchObject([{ secret: abbess.id }]);
  expect((await rival.call("get", { ref: theirs.id })).status).toBe("hidden");
});

test("a commit applies reveals and changes together or not at all", async () => {
  const { c, session, abbess } = await debriefWithSecrets();
  await c.call("debrief_add", {
    session,
    briefing,
    changes: [tobinNamesTheAbbess],
    reveals: [
      {
        secret: abbess.id,
        scene: 1,
        learned: "The abbess raised the toll.",
        sources: [{ quote: "The toll was raised by the abbess herself." }],
        whole: false,
      },
    ],
  });
  await c.call("secret_write", {
    op: "drop",
    secret: abbess.id,
    reason: "I discard the abbess plot before committing",
  });
  const draft = await c.call("get", { ref: `debrief:${session}` });

  await expect(c.call("debrief_commit", { session })).rejects.toThrow(
    "is no longer valid: Only a hidden or partly revealed secret can be revealed",
  );

  expect(await c.call("get", { ref: `debrief:${session}` })).toEqual(draft);
  expect(
    (await c.call("find", { query: "abbess", types: ["entity"] })).hits,
  ).toEqual([]);
  expect(
    (await c.call("get", { ref: abbess.id })).history.map(
      (h: { op: string }) => h.op,
    ),
  ).toEqual(["write", "drop"]);
});

test("a reveal is dropped like a change, and the commit leaves its secret hidden", async () => {
  const { c, session, abbess } = await debriefWithSecrets();
  const added = await c.call("debrief_add", {
    session,
    briefing,
    changes: [tobinNamesTheAbbess],
    reveals: [
      {
        secret: abbess.id,
        scene: 1,
        learned: "The abbess raised the toll.",
        sources: [{ quote: "The toll was raised by the abbess herself." }],
        whole: false,
      },
    ],
  });
  const [{ id }] = added.draft.reveals;

  const dropped = await c.call("debrief_drop", { session, changeIds: [id] });
  expect(dropped.draft.reveals).toEqual([]);
  expect(dropped.draft.changes).toHaveLength(1);
  await expect(
    c.call("debrief_drop", { session, changeIds: [id] }),
  ).rejects.toThrow("Change or reveal not found in this draft");

  await c.call("debrief_commit", { session });
  const read = await c.call("get", { ref: abbess.id });
  expect(read.status).toBe("hidden");
  expect(read.history.map((h: { op: string }) => h.op)).toEqual(["write"]);
});

test("a commit refuses a reveal whose secret changed after it was drafted", async () => {
  const { c, session, ledger } = await debriefWithSecrets();
  await c.call("debrief_add", {
    session,
    briefing,
    changes: [tobinNamesTheAbbess],
    reveals: [
      {
        secret: ledger.id,
        scene: 2,
        learned: "The heron ledger lists every bribed toll-keeper.",
        sources: [
          {
            quote: "Behind the altar you find a ledger stamped with a heron.",
            at: "00:03:30",
          },
        ],
        whole: true,
      },
    ],
  });
  const changed = await c.call("secret_write", {
    op: "change",
    secret: ledger.id,
    text: "The heron ledger lists every bribed toll-keeper, and the abbess wrote it.",
    reason: "I add who kept the ledger",
  });

  await expect(c.call("debrief_commit", { session })).rejects.toThrow(
    "changed after this reveal was drafted",
  );

  expect(await c.call("get", { ref: ledger.id })).toMatchObject({
    ...changed.secret,
    status: "hidden",
  });
  expect((await c.call("get", { ref: "overview" })).openSecrets).toBe(2);
});
