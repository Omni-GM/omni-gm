import { expect, test } from "vitest";
import { client } from "./mcp-client";

async function started() {
  const c = client();
  await c.init();
  await c.call("adventure_start", {
    name: "The Copper Ferry",
    reason: "Invented reference-session proof",
  });
  return c;
}

async function upload(c: ReturnType<typeof client>, session: string) {
  const { url } = await c.call("transcript_upload_url", { session });
  const parsed = new URL(url);
  const result = await c.t.fetch(parsed.pathname + parsed.search, {
    method: "PUT",
    body: "[00:01:10] GM: The copper ferry crosses the river.\n",
  });
  expect(result.status).toBe(200);
}

async function committed(c: ReturnType<typeof client>) {
  const recent = await c.call("session_create", { playedOn: "2026-03-07" });
  await upload(c, recent.id);
  await c.call("scenes_set", {
    session: recent.id,
    scenes: [
      {
        title: "The ferry",
        start: "00:01:10",
        place: "River",
        summary: "The party crosses.",
      },
    ],
  });
  await c.call("debrief_add", {
    session: recent.id,
    briefing: "The party crossed the river on the copper ferry.",
    changes: [
      {
        scene: 1,
        change: { op: "new", kind: "place", name: "Copper ferry" },
        basis: ["narrated"],
        sources: [
          { quote: "The copper ferry crosses the river.", at: "00:01:10" },
        ],
        why: "Remember the crossing",
      },
    ],
  });
  await c.call("debrief_commit", { session: recent.id });
  return await c.call("get", { ref: `session:${recent.id}` });
}

test("a late-added reference sorts by played date and preserves the latest committed session and briefing", async () => {
  const c = await started();
  const recent = await committed(c);
  const before = await c.call("get", { ref: "overview" });
  const reference = await c.call("session_create", {
    playedOn: "2026-01-03",
    reference: true,
  });
  expect(reference.status).toBe("reference");
  await upload(c, reference.id);
  const middle = await c.call("session_create", { playedOn: "2026-02-07" });
  const after = await c.call("get", { ref: "overview" });
  expect(after.sessions.map((s: { id: string }) => s.id)).toEqual([
    recent.id,
    middle.id,
    reference.id,
  ]);
  expect(after.latestSession).toEqual(before.latestSession);
  expect(after.latestSession.id).toBe(recent.id);
  expect(after.briefing).toEqual(before.briefing);
  expect(after.commits).toEqual(before.commits);
  expect(await c.call("get", { ref: `session:${reference.id}` })).toEqual(
    reference,
  );
});

test("reference sessions refuse every scene and debrief operation while keeping their transcript", async () => {
  const c = await started();
  const reference = await c.call("session_create", {
    playedOn: "2026-01-03",
    reference: true,
  });
  await upload(c, reference.id);
  for (const [name, args] of [
    [
      "scenes_set",
      {
        scenes: [
          {
            title: "The ferry",
            start: "00:01:10",
            place: "River",
            summary: "Crossing",
          },
        ],
      },
    ],
    ["debrief_add", { changes: [], briefing: "Never a briefing" }],
    ["debrief_drop", { changeIds: [] }],
    ["debrief_commit", {}],
    ["get", { ref: `debrief:${reference.id}` }],
  ] as const) {
    await expect(
      c.call(name, name === "get" ? args : { session: reference.id, ...args }),
    ).rejects.toThrow(/Reference sessions/);
  }
  expect(await c.call("get", { ref: `session:${reference.id}` })).toEqual(
    reference,
  );
  expect(
    (await c.call("get", { ref: `transcript:${reference.id}` })).utterances[0]
      .text,
  ).toBe("The copper ferry crosses the river.");
  const overview = await c.call("get", { ref: "overview" });
  expect(overview.latestSession).toBeNull();
  expect(overview.briefing).toBeNull();
  expect(
    overview.commits.map((commit: { kind: string }) => commit.kind),
  ).toEqual(["seed"]);
});

test("find labels utterances with their stable session ordinal and played date across references and played sessions", async () => {
  const c = await started();
  const recent = await c.call("session_create", { playedOn: "2026-03-07" });
  await upload(c, recent.id);
  const older = await c.call("session_create", {
    playedOn: "2026-01-03",
    reference: true,
  });
  await upload(c, older.id);
  const found = await c.call("find", {
    query: "copper ferry",
    types: ["transcript"],
    limit: 1,
  });
  const next = await c.call("find", {
    query: "copper ferry",
    types: ["transcript"],
    limit: 1,
    cursor: found.nextCursor,
  });
  expect(
    [...found.hits, ...next.hits].map(
      (hit: { title: string; session: unknown }) => ({
        title: hit.title,
        session: hit.session,
      }),
    ),
  ).toEqual([
    {
      title: "S1 2026-03-07 00:01:10 GM",
      session: { id: recent.id, ordinal: 1, playedOn: "2026-03-07" },
    },
    {
      title: "S2 2026-01-03 00:01:10 GM",
      session: { id: older.id, ordinal: 2, playedOn: "2026-01-03" },
    },
  ]);
  expect((await c.call("get", { ref: next.hits[0].ref })).session).toBe(
    older.id,
  );
});

test("a reference cannot become latest even with a later played date or more references than the overview window", async () => {
  const c = await started();
  const played = await committed(c);
  for (let n = 0; n < 201; n++)
    await c.call("session_create", { playedOn: "2026-04-04", reference: true });
  const overview = await c.call("get", { ref: "overview" });
  expect(overview.sessions).toHaveLength(200);
  expect(
    overview.sessions.every(
      (s: { status: string }) => s.status === "reference",
    ),
  ).toBe(true);
  expect(overview.latestSession).toEqual(played);
});

test("an undebriefed newer draft does not replace the session behind the stored briefing", async () => {
  const c = await started();
  const recent = await committed(c);
  const before = await c.call("get", { ref: "overview" });
  const draft = await c.call("session_create", { playedOn: "2026-04-04" });
  const after = await c.call("get", { ref: "overview" });
  expect(after.sessions[0].id).toBe(draft.id);
  expect(after.latestSession).toEqual(recent);
  expect(after.briefing).toEqual(before.briefing);
});
