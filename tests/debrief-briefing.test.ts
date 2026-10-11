import { expect, test } from "vitest";
import { client } from "./mcp-client";

const briefing = `Where the party stands
At the ferry at dusk [00:01:10]; the party plans to cross at dawn [00:02:20].

What next
1. Go to the first checklist section (recommended).
2. Start a short frame talk.`;

const seraSpeaks = {
  scene: 1,
  change: {
    op: "new",
    tempKey: "sera",
    kind: "npc",
    name: "Sera Venn",
    properties: { playedAs: "Softly, with a snapped final word" },
  },
  basis: ["npc_said"],
  sources: [{ quote: "Mind the stones, dear.", at: "00:01:10" }],
  why: "Keep the voice for next prep",
};

async function debriefReadyToReview() {
  const c = client();
  await c.init();
  await c.call("adventure_start", {
    name: "The Glass Causeway",
    reason: "Arrived",
  });
  const s = await c.call("session_create", { playedOn: "2026-01-03" });
  const { url } = await c.call("transcript_upload_url", { session: s.id });
  await c.t.fetch(new URL(url).pathname + new URL(url).search, {
    method: "PUT",
    body: "[00:01:10] GM as Sera Venn: Mind the stones, dear.\n[00:02:20] Rowan: We cross at dawn.\n",
  });
  await c.call("scenes_set", {
    session: s.id,
    scenes: [
      {
        title: "The ferry",
        start: "00:01:10",
        place: "Glass Causeway",
        summary: "Sera offers passage.",
      },
    ],
  });
  return { c, session: s.id };
}

test("the committed debrief stores its briefing, and the overview returns it with the corrections written since", async () => {
  const { c, session } = await debriefReadyToReview();
  expect((await c.call("get", { ref: "overview" })).briefing).toBeNull();

  await c.call("debrief_add", { session, briefing, changes: [seraSpeaks] });
  const { commit } = await c.call("debrief_commit", { session });
  expect((await c.call("get", { ref: "overview" })).briefing).toEqual({
    session,
    commit,
    text: briefing,
    correctionsSince: [],
  });

  const sera = (await c.call("find", { query: "Sera Venn" })).hits[0].ref;
  const correction = await c.call("story_commit", {
    reason: "Plank answer: Sera ferries for the raiders",
    changes: [
      {
        change: {
          op: "update",
          entity: sera.replace(/^entity:/, ""),
          properties: { wants: "Keep the raiders' crossing secret" },
        },
        basis: ["game_master"],
        sources: [{ quote: "She ferries for the raiders, and nobody knows." }],
        why: "The game master answered a plank question",
      },
    ],
  });
  expect(
    (await c.call("get", { ref: "overview" })).briefing.correctionsSince,
  ).toEqual([
    {
      commit: correction.commit,
      reason: "Plank answer: Sera ferries for the raiders",
    },
  ]);
});

test("a debrief without a briefing is refused at commit", async () => {
  const { c, session } = await debriefReadyToReview();
  await c.call("debrief_add", { session, changes: [seraSpeaks] });
  await expect(c.call("debrief_commit", { session })).rejects.toThrow(
    "A commit needs draft changes and a briefing",
  );
  expect((await c.call("get", { ref: `debrief:${session}` })).status).toBe(
    "draft",
  );
});

test("a briefing over 16 KB is refused and leaves the draft as it was", async () => {
  const { c, session } = await debriefReadyToReview();
  await c.call("debrief_add", { session, briefing, changes: [seraSpeaks] });
  await expect(
    c.call("debrief_add", {
      session,
      briefing: "x".repeat(16_001),
      changes: [],
    }),
  ).rejects.toThrow("Keep the briefing within 16 KB");
  expect((await c.call("get", { ref: `debrief:${session}` })).briefing).toBe(
    briefing,
  );
});

test("past 200 corrections, the overview keeps the newest ones written since the debrief", async () => {
  const { c, session } = await debriefReadyToReview();
  await c.call("debrief_add", { session, briefing, changes: [seraSpeaks] });
  await c.call("debrief_commit", { session });
  const sera = (await c.call("find", { query: "Sera Venn" })).hits[0].ref;
  for (let i = 1; i <= 201; i++)
    await c.call("story_commit", {
      reason: `Correction ${i}`,
      changes: [
        {
          change: {
            op: "update",
            entity: sera.replace(/^entity:/, ""),
            properties: { knows: `Fact ${i}` },
          },
          basis: ["game_master"],
          sources: [{ quote: `Fact ${i}` }],
          why: "The game master corrected the store",
        },
      ],
    });
  const reasons = (
    await c.call("get", { ref: "overview" })
  ).briefing.correctionsSince.map((r: { reason: string }) => r.reason);
  expect(reasons).toHaveLength(200);
  expect(reasons[0]).toBe("Correction 2");
  expect(reasons.at(-1)).toBe("Correction 201");
});
