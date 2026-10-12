import type { client } from "./mcp-client";

export const saltRoadBriefing = `Where the party stands
On the salt road at dusk [00:01:10].

What next
1. Go to the first checklist section (recommended).`;

export const tobinNamesTheAbbess = {
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

export async function saltRoadSession(
  c: ReturnType<typeof client>,
): Promise<string> {
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
  return s.id;
}
