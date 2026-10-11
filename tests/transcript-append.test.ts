import { afterEach, expect, test, vi } from "vitest";
import { client, createTest } from "./mcp-client";

afterEach(() => {
  vi.useRealTimers();
});

async function session(c = client()) {
  await c.init();
  await c.call("adventure_start", {
    name: "The Lantern Causeway",
    reason: "Invented upload proof",
  });
  const s = await c.call("session_create", { playedOn: "2026-01-03" });
  return { c, s };
}

async function downloaded(c: ReturnType<typeof client>, id: string) {
  const stored = await c.call("get", { ref: `transcript:${id}` });
  const url = new URL(stored.downloadUrl);
  const response = await c.owner.fetch(url.pathname + url.search);
  expect(response.status).toBe(200);
  return { text: await response.text(), utterances: stored.utterances };
}

test("an agent uploads chunks without a shell and stores the signed path's exact bytes and utterances", async () => {
  const { c, s } = await session();
  const chunks = [
    "[00:00:00] GM: The café gate opens.\r\nA lantern glows ",
    "🕯️\r\n[00:00:10] Rowan: I cross the bridge.\r\n",
  ];
  const first = await c.call("transcript_append", {
    session: s.id,
    chunk: chunks[0],
    index: 0,
    final: false,
  });
  expect(first).toMatchObject({ uploaded: false, nextIndex: 1 });
  const last = await c.call("transcript_append", {
    session: s.id,
    chunk: chunks[1],
    index: 1,
    final: true,
  });
  expect(last).toMatchObject({ uploaded: true, nextIndex: 2 });
  const appended = await downloaded(c, s.id);
  expect(appended.text).toBe(chunks.join(""));
  const signed = await c.call("session_create", { playedOn: "2026-01-04" });
  const { url } = await c.call("transcript_upload_url", { session: signed.id });
  const target = new URL(url);
  expect(
    (
      await c.t.fetch(target.pathname + target.search, {
        method: "PUT",
        body: chunks.join(""),
      })
    ).status,
  ).toBe(200);
  expect(await downloaded(c, signed.id)).toEqual(appended);
});

test("duplicate chunks and a lost final reply can be retried without duplicating the transcript", async () => {
  const { c, s } = await session();
  const first = {
    session: s.id,
    chunk: "[00:00:00] GM: A lantern glows.\n",
    index: 0,
    final: false,
  };
  const accepted = await c.call("transcript_append", first);
  expect(await c.call("transcript_append", first)).toEqual(accepted);
  await expect(
    c.call("transcript_append", { ...first, chunk: "different" }),
  ).rejects.toThrow("send restart: true with index 0");
  const final = {
    session: s.id,
    chunk: "[00:00:10] Rowan: We follow.\n",
    index: 1,
    final: true,
  };
  const finished = await c.call("transcript_append", final);
  expect(await c.call("transcript_append", final)).toEqual(finished);
  expect((await downloaded(c, s.id)).text).toBe(first.chunk + final.chunk);
});

test("an invalid final upload leaves the old transcript readable and the agent can restart with corrected bytes", async () => {
  const { c, s } = await session();
  const original = {
    session: s.id,
    chunk: "[00:00:00] GM: The old lantern.\n",
    index: 0,
    final: true,
  };
  await c.call("transcript_append", original);
  const invalid = {
    ...original,
    chunk: "not a timestamped transcript",
    restart: true,
  };
  await expect(c.call("transcript_append", invalid)).rejects.toThrow(
    "HH:MM:SS",
  );
  await expect(
    c.call("transcript_append", { ...invalid, restart: false }),
  ).rejects.toThrow("HH:MM:SS");
  expect((await downloaded(c, s.id)).text).toBe(original.chunk);
  const corrected = "[00:00:00] GM: The new lantern.\n";
  await c.call("transcript_append", {
    ...original,
    chunk: corrected,
    restart: true,
  });
  expect((await downloaded(c, s.id)).text).toBe(corrected);
});

test("a final retry cannot claim that a later signed replacement is the appended transcript", async () => {
  const { c, s } = await session();
  const upload = {
    session: s.id,
    chunk: "[00:00:00] GM: Old lantern.\n",
    index: 0,
    final: true,
  };
  await c.call("transcript_append", upload);
  const { url } = await c.call("transcript_upload_url", { session: s.id });
  const target = new URL(url);
  const replacement = "[00:00:00] GM: New lantern.\n";
  expect(
    (
      await c.t.fetch(target.pathname + target.search, {
        method: "PUT",
        body: replacement,
      })
    ).status,
  ).toBe(200);
  await expect(c.call("transcript_append", upload)).rejects.toThrow("replaced");
  expect((await downloaded(c, s.id)).text).toBe(replacement);
});

test("a chunk cannot split a Unicode character", async () => {
  const { c, s } = await session();
  await expect(
    c.call("transcript_append", {
      session: s.id,
      chunk: "[00:00:00] GM: \ud83d",
      index: 0,
      final: false,
    }),
  ).rejects.toThrow("Unicode");
});

test("expired staging is cleaned without deleting a completed transcript, and the agent can upload again", async () => {
  vi.useFakeTimers();
  const { c, s } = await session();
  const upload = {
    session: s.id,
    chunk: "[00:00:00] GM: The lantern.\n",
    index: 0,
    final: true,
  };
  await c.call("transcript_append", upload);
  await c.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect((await downloaded(c, s.id)).text).toBe(upload.chunk);
  const replacement = "[00:00:00] GM: A different lantern.\n";
  expect(
    await c.call("transcript_append", { ...upload, chunk: replacement }),
  ).toMatchObject({ uploaded: true });
  expect((await downloaded(c, s.id)).text).toBe(replacement);
});

test("the agent restarts an expired incomplete upload and stores the transcript", async () => {
  vi.useFakeTimers();
  const { c, s } = await session();
  const upload = {
    session: s.id,
    chunk: "[00:00:00] GM: The lantern.\n",
    index: 0,
    final: false,
  };
  await c.call("transcript_append", upload);
  vi.setSystemTime(Date.now() + 60 * 60_000 + 1);
  await expect(c.call("transcript_append", upload)).rejects.toThrow("expired");
  expect(
    await c.call("transcript_append", {
      ...upload,
      final: true,
      restart: true,
    }),
  ).toMatchObject({ uploaded: true });
  expect((await downloaded(c, s.id)).text).toBe(upload.chunk);
});

test("missing and out-of-order chunks cannot publish, and sending the missing index recovers", async () => {
  const { c, s } = await session();
  const first = {
    session: s.id,
    chunk: "[00:00:00] GM: The lantern.\n",
    index: 0,
    final: false,
  };
  await expect(
    c.call("transcript_append", { ...first, index: 1, final: true }),
  ).rejects.toThrow("index 0");
  await c.call("transcript_append", first);
  await expect(
    c.call("transcript_append", { ...first, index: 2, final: true }),
  ).rejects.toThrow("index 1");
  await expect(c.call("get", { ref: `transcript:${s.id}` })).rejects.toThrow(
    "Upload a transcript first",
  );
  await c.call("transcript_append", {
    ...first,
    chunk: "[00:00:10] Rowan: The ferry.\n",
    index: 1,
    final: true,
  });
  expect((await downloaded(c, s.id)).utterances).toHaveLength(2);
});

test("chunk uploads are private to their owner and locked once scenes exist", async () => {
  const shared = createTest();
  const { c, s } = await session(client("invented-owner", shared));
  const other = client("invented-other", shared);
  await session(other);
  const upload = {
    session: s.id,
    chunk: "[00:00:00] GM: The lantern.\n",
    index: 0,
    final: true,
  };
  await expect(other.call("transcript_append", upload)).rejects.toThrow(
    "Session not found",
  );
  await c.call("transcript_append", upload);
  await expect(other.call("transcript_append", upload)).rejects.toThrow(
    "Session not found",
  );
  await c.call("scenes_set", {
    session: s.id,
    scenes: [
      {
        title: "The lantern",
        start: "00:00:00",
        place: "The quay",
        summary: "A lantern burns.",
      },
    ],
  });
  await expect(c.call("transcript_append", upload)).rejects.toThrow("locked");
  await expect(
    c.call("transcript_append", { ...upload, restart: true }),
  ).rejects.toThrow("locked");
  expect((await downloaded(c, s.id)).text).toBe(upload.chunk);
});

test("chunk and total size limits count UTF-8 bytes and leave rejected chunks retryable", async () => {
  const { c, s } = await session();
  const upload = {
    session: s.id,
    chunk: "é".repeat(32_001),
    index: 0,
    final: false,
  };
  await expect(c.call("transcript_append", upload)).rejects.toThrow("64000");
  for (let index = 0; index < 125; index++) {
    const chunk =
      index === 0
        ? "[00:00:00] GM: Lantern.\n".padEnd(64_000, " ")
        : " ".repeat(64_000);
    const reply = await c.call("transcript_append", {
      ...upload,
      chunk,
      index,
    });
    expect(reply.bytes).toBe((index + 1) * 64_000);
  }
  await expect(
    c.call("transcript_append", {
      ...upload,
      chunk: "\n",
      index: 125,
      final: true,
    }),
  ).rejects.toThrow("8 MB");
  await expect(c.call("get", { ref: `transcript:${s.id}` })).rejects.toThrow(
    "Upload a transcript first",
  );
});

test.each([
  [
    "timestamp order",
    "[00:00:10] GM: Later.\n[00:00:00] GM: Earlier.\n",
    "timestamps must be in order",
  ],
  ["utterance bytes", `[00:00:00] GM: ${"é".repeat(16_001)}\n`, "32 KB"],
  ["utterance count", "[00:00:00] GM: Lantern.\n".repeat(20_001), "20000"],
])(
  "chunk uploads enforce the signed path's %s limit",
  async (_name, text, error) => {
    const { c, s } = await session();
    const chunks = text.match(/[\s\S]{1,30000}/g) ?? [];
    for (const [index, chunk] of chunks.entries()) {
      const call = c.call("transcript_append", {
        session: s.id,
        chunk,
        index,
        final: index === chunks.length - 1,
      });
      if (index === chunks.length - 1)
        await expect(call).rejects.toThrow(error);
      else await call;
    }
    await expect(c.call("get", { ref: `transcript:${s.id}` })).rejects.toThrow(
      "Upload a transcript first",
    );
  },
);
