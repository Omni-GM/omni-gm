import { expect, test } from "vitest";
import { client } from "./mcp-client";

const seraSpeaks = {
  scene: 1,
  change: {
    op: "new",
    kind: "npc",
    name: "Sera Venn",
    properties: { playedAs: "Softly, with a snapped final word" },
  },
  basis: ["npc_said"],
  sources: [{ quote: "Mind the stones, dear.", at: "00:01:10" }],
  why: "Keep the voice for next prep",
};

async function playedSession(c: ReturnType<typeof client>) {
  const s = await c.call("session_create", { playedOn: "2026-01-03" });
  const { url } = await c.call("transcript_upload_url", { session: s.id });
  await c.t.fetch(new URL(url).pathname + new URL(url).search, {
    method: "PUT",
    body: "[00:01:10] GM as Sera Venn: Mind the stones, dear.\n",
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
  return s.id;
}

async function commitDebrief(c: ReturnType<typeof client>) {
  const session = await playedSession(c);
  await c.call("debrief_add", {
    session,
    briefing: "Sera waits by the ferry.",
    changes: [seraSpeaks],
  });
  await c.call("debrief_commit", { session });
}

async function frameCurrency(c: ReturnType<typeof client>) {
  return (await c.call("get", { ref: "overview" })).frame.currency;
}

test("the overview tells whether the adventure frame is missing, older than the latest committed debrief, or current", async () => {
  const c = client();
  await c.init();
  await c.call("adventure_start", {
    name: "The Glass Causeway",
    reason: "Arrived",
  });
  expect(await frameCurrency(c)).toBe("missing");

  await c.call("frame_update", {
    reason: "First intent",
    fields: { goal: "Restore passage", stakes: "The village is cut off" },
  });
  expect(await frameCurrency(c)).toBe("missing");

  await c.call("frame_update", {
    reason: "The gate sets the clock",
    fields: { timeframe: "Before the gate closes at dusk" },
  });
  expect(await frameCurrency(c)).toBe("current");

  await commitDebrief(c);
  expect(await frameCurrency(c)).toBe("stale");

  await c.call("frame_update", {
    reason: "Still holds after the ferry session",
    fields: { goal: "Restore passage" },
  });
  expect(await frameCurrency(c)).toBe("current");

  await c.call("frame_update", {
    reason: "Leave the timeframe open",
    fields: { timeframe: " " },
  });
  expect(await frameCurrency(c)).toBe("missing");
});

test("prep leads the briefing's what-next options with a skippable short frame talk while the frame is missing or stale", async () => {
  const c = client();
  await c.init();
  const briefing = (await c.call("skill", { name: "briefing" })).procedure;
  for (const text of [
    "exactly as stored, except for the What next change below",
    "overview.frame.currency is missing or stale",
    "add a short frame talk there as option 1 (recommended)",
    "renumber the stored options after it and drop their recommended mark",
    "every other stored line stays word for word",
    "skip",
  ])
    expect(briefing).toContain(text);

  const frameTalk = (await c.call("skill", { name: "frame-talk" })).procedure;
  for (const text of [
    "Short form",
    "only goal, stakes and timeframe",
    "still hold after the latest session",
    "store them unchanged",
    "load prep-sparring",
  ])
    expect(frameTalk).toContain(text);

  const tools: { name: string; description: string }[] = (
    await c.rpc("tools/list")
  ).result.tools;
  expect(tools.find((t) => t.name === "get")?.description).toContain(
    "frame.currency",
  );
});
