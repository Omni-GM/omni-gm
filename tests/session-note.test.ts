import { expect, test } from "vitest";
import { client } from "./mcp-client";

const checklist = {
  sections: [
    { name: "Launch", definition: "Two opening situations" },
    { name: "Discoveries", definition: "Ten clues" },
    { name: "Supplies", definition: "Only my materials" },
  ],
  template: "# Next session\n## Launch\n## Discoveries\n## Supplies",
};

async function commitSession(
  c: ReturnType<typeof client>,
  playedOn = "2026-01-03",
) {
  const s = await c.call("session_create", { playedOn });
  const { url } = await c.call("transcript_upload_url", { session: s.id });
  await c.t.fetch(new URL(url).pathname + new URL(url).search, {
    method: "PUT",
    body: "[00:00:10] GM: The ferry is here.\n",
  });
  await c.call("scenes_set", {
    session: s.id,
    scenes: [
      { title: "Ferry", start: "00:00:10", place: "River", summary: "Arrived" },
    ],
  });
  await c.call("debrief_add", {
    session: s.id,
    briefing: "The ferry is here [00:00:10].",
    changes: [
      {
        scene: 1,
        change: { op: "new", kind: "place", name: `Ferry ${s.id}` },
        basis: ["narrated"],
        sources: [{ quote: "The ferry is here.", at: "00:00:10" }],
        why: "Remember the landing",
      },
    ],
  });
  await c.call("debrief_commit", { session: s.id });
  return s.id as string;
}

async function prep(
  subject = "invented-gm",
  shared?: ReturnType<typeof client>["t"],
) {
  const c = client(subject, shared);
  await c.init();
  await c.call("adventure_start", {
    name: "The Amber Ferry",
    reason: "Invented note proof",
  });
  await c.call("checklist_set", { ...checklist, reason: "My process" });
  return { c, session: await commitSession(c) };
}

test("picks and status updates keep every other section untouched and a fresh client resumes", async () => {
  const { c, session } = await prep();
  expect((await c.call("get", { ref: "note" })).note).toEqual({
    session,
    checklist,
    status: "in_progress",
    entries: [
      { section: "Launch", entry: "", status: "open" },
      { section: "Discoveries", entry: "", status: "open" },
      { section: "Supplies", entry: "", status: "open" },
    ],
  });
  await c.call("note_write", {
    session,
    op: "upsert",
    section: "Launch",
    entry: "The ferry rope snaps.",
    status: "done",
  });
  await c.call("note_write", {
    session,
    op: "upsert",
    section: "Discoveries",
    status: "skipped",
  });
  await c.call("note_write", {
    session,
    op: "upsert",
    section: "Launch",
    entry: "The rope frays, then snaps.",
  });
  const fresh = client("invented-gm", c.t);
  await fresh.init();
  expect((await fresh.call("get", { ref: "note" })).note.entries).toEqual([
    { section: "Launch", entry: "The rope frays, then snaps.", status: "done" },
    { section: "Discoveries", entry: "", status: "skipped" },
    { section: "Supplies", entry: "", status: "open" },
  ]);
  expect((await fresh.call("get", { ref: "overview" })).prep).toEqual({
    session,
    status: "in_progress",
    done: ["Launch"],
    skipped: ["Discoveries"],
    open: ["Supplies"],
    nextSection: "Supplies",
  });
  const before = await fresh.call("get", { ref: "note" });
  await expect(
    c.call("note_write", {
      session,
      op: "upsert",
      section: "Unknown",
      entry: "No",
    }),
  ).rejects.toThrow("not in this prep's checklist");
  expect(await c.call("get", { ref: "note" })).toEqual(before);
});

test("finished notes reject edits until reopened with a reason", async () => {
  const { c, session } = await prep();
  await expect(c.call("note_write", { session, op: "finish" })).rejects.toThrow(
    "Resolve open sections",
  );
  for (const section of ["Launch", "Discoveries", "Supplies"])
    await c.call("note_write", {
      session,
      op: "upsert",
      section,
      status: "skipped",
    });
  expect(
    (await c.call("note_write", { session, op: "finish" })).note.status,
  ).toBe("finished");
  const finished = await c.call("get", { ref: "note" });
  for (const args of [
    { op: "upsert", section: "Launch", entry: "Changed", status: "done" },
    { op: "finish" },
    { op: "reopen", reason: " \n" },
  ]) {
    await expect(c.call("note_write", { session, ...args })).rejects.toThrow();
    expect(await c.call("get", { ref: "note" })).toEqual(finished);
  }
  const reopened = await c.call("note_write", {
    session,
    op: "reopen",
    reason: "The players changed their plan",
  });
  expect(reopened.note).toEqual({
    ...finished.note,
    status: "in_progress",
    reopenReason: "The players changed their plan",
  });
  await c.call("note_write", {
    session,
    op: "upsert",
    section: "Launch",
    entry: "They leave by boat.",
    status: "done",
  });
  expect((await c.call("get", { ref: "note" })).note.entries[0]).toEqual({
    section: "Launch",
    entry: "They leave by boat.",
    status: "done",
  });
});

test("a new committed debrief starts a new note and stale clients cannot change it", async () => {
  const { c, session } = await prep();
  await c.call("note_write", {
    session,
    op: "upsert",
    section: "Launch",
    entry: "Rope snaps.",
    status: "done",
  });
  await c.call("checklist_set", {
    sections: [{ name: "New opening", definition: "A new process" }],
    template: "# Revised session\n## New opening",
    reason: "Use next prep",
  });
  expect((await c.call("get", { ref: "note" })).note.checklist).toEqual(
    checklist,
  );
  const draft = await c.call("session_create", { playedOn: "2026-01-04" });
  expect((await c.call("get", { ref: "note" })).note.session).toBe(session);
  await c.call("session_create", { playedOn: "2025-12-01", reference: true });
  expect((await c.call("get", { ref: "note" })).note.session).toBe(session);
  expect((await c.call("get", { ref: "overview" })).latestSession.id).toBe(
    session,
  );
  const next = await commitSession(c, "2026-01-05");
  expect(next).not.toBe(draft.id);
  const expected = {
    session: next,
    status: "in_progress",
    done: [],
    skipped: [],
    open: ["New opening"],
    nextSection: "New opening",
  };
  expect((await c.call("get", { ref: "overview" })).prep).toEqual(expected);
  const before = await c.call("get", { ref: "note" });
  expect(before.note.entries).toEqual([
    { section: "New opening", entry: "", status: "open" },
  ]);
  await expect(
    c.call("note_write", {
      session,
      op: "upsert",
      section: "New opening",
      entry: "Stale pick",
    }),
  ).rejects.toThrow("Prep changed");
  expect(await c.call("get", { ref: "note" })).toEqual(before);
});

test("another owner cannot read, overwrite or spoof the note's owner", async () => {
  const alice = await prep("invented-alice");
  await alice.c.call("note_write", {
    session: alice.session,
    op: "upsert",
    section: "Launch",
    entry: "Alice's pick",
    status: "done",
  });
  const before = await alice.c.call("get", { ref: "note" });
  const bob = await prep("invented-bob", alice.c.t);
  expect((await bob.c.call("get", { ref: "note" })).note.entries[0].entry).toBe(
    "",
  );
  await expect(
    bob.c.call("note_write", {
      session: alice.session,
      op: "upsert",
      section: "Launch",
      entry: "Stolen",
    }),
  ).rejects.toThrow("Prep changed");
  const spoof = await bob.c.rpc("tools/call", {
    name: "note_write",
    arguments: {
      session: bob.session,
      op: "upsert",
      section: "Launch",
      entry: "Bob's pick",
      caller: { subject: "invented-alice" },
    },
  });
  expect(spoof.error || spoof.result?.isError).toBeFalsy();
  expect((await bob.c.call("get", { ref: "note" })).note.entries[0].entry).toBe(
    "Bob's pick",
  );
  expect(await alice.c.call("get", { ref: "note" })).toEqual(before);
});

test("prep is unavailable until a checklist and committed debrief exist", async () => {
  const c = client();
  await c.init();
  await c.call("adventure_start", { name: "Amber Ferry", reason: "Start" });
  expect(await c.call("get", { ref: "note" })).toEqual({ note: null });
  expect((await c.call("get", { ref: "overview" })).prep).toBeNull();
  await c.call("checklist_set", { ...checklist, reason: "Process" });
  expect(await c.call("get", { ref: "note" })).toEqual({ note: null });
  await expect(
    c.call("note_write", { session: "none", op: "finish" }),
  ).rejects.toThrow("Commit a debrief");
  const other = client("invented-other", c.t);
  await other.init();
  await other.call("adventure_start", {
    name: "Copper Ferry",
    reason: "Start",
  });
  await commitSession(other);
  expect(await other.call("get", { ref: "note" })).toEqual({ note: null });
});

test("oversized entries, reasons and aggregate notes reject without writing", async () => {
  const { c, session } = await prep();
  await c.call("note_write", {
    session,
    op: "upsert",
    section: "Launch",
    entry: "x".repeat(16_000),
    status: "done",
  });
  const before = await c.call("get", { ref: "note" });
  for (const entry of ["x".repeat(16_001), "界".repeat(5334)]) {
    await expect(
      c.call("note_write", { session, op: "upsert", section: "Launch", entry }),
    ).rejects.toThrow("Entry must fit within 16 KB");
    expect(await c.call("get", { ref: "note" })).toEqual(before);
  }
  for (const section of ["Discoveries", "Supplies"])
    await c.call("note_write", {
      session,
      op: "upsert",
      section,
      status: "skipped",
    });
  await c.call("note_write", { session, op: "finish" });
  const finished = await c.call("get", { ref: "note" });
  await expect(
    c.call("note_write", { session, op: "reopen", reason: "x".repeat(2001) }),
  ).rejects.toThrow("Reason must fit within 2 KB");
  expect(await c.call("get", { ref: "note" })).toEqual(finished);
  const other = client("invented-large", c.t);
  await other.init();
  await other.call("adventure_start", {
    name: "Long notes",
    reason: "Invented",
  });
  await other.call("checklist_set", {
    sections: Array.from({ length: 10 }, (_, i) => ({
      name: `Part ${i}`,
      definition: "Material",
    })),
    template: "# Notes",
    reason: "Larger checklist",
  });
  const otherSession = await commitSession(other);
  for (let i = 0; i < 7; i++)
    await other.call("note_write", {
      session: otherSession,
      op: "upsert",
      section: `Part ${i}`,
      entry: "x".repeat(16_000),
      status: "done",
    });
  const large = await other.call("get", { ref: "note" });
  await expect(
    other.call("note_write", {
      session: otherSession,
      op: "upsert",
      section: "Part 7",
      entry: "x".repeat(16_000),
      status: "done",
    }),
  ).rejects.toThrow("Note must fit within 128 KB");
  expect(await other.call("get", { ref: "note" })).toEqual(large);
});
