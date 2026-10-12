import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Infer } from "convex/values";
import type { sessionNote } from "../convex/model";

const proof = "proof/session-note";
const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "omni-gm-note-proof", version: "1" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
console.log(`PROOF TARGET ${new URL(url).origin}`);
async function call<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const result = (await client.callTool({
    name,
    arguments: args,
  })) as CallToolResult;
  assert(!result.isError && result.structuredContent, `${name} failed`);
  return result.structuredContent as T;
}
async function get<T>(ref: string): Promise<T> {
  return (await call<{ value: T }>("get", { ref, limit: 200 })).value;
}
async function note() {
  return (await get<{ note: Infer<typeof sessionNote> | null }>("note")).note;
}
async function snapshot() {
  const overview = await get<{ prep?: unknown; sessions: { id: string }[] }>(
    "overview",
  );
  const { prep: _prep, ...existing } = overview;
  const found = await call<{ hits: { ref: string }[]; truncated: boolean }>(
    "find",
    { types: ["entity"], limit: 200 },
  );
  assert(!found.truncated);
  return {
    overview: existing,
    frame: await get("frame"),
    schema: await get("schema"),
    checklist: await get("checklist"),
    secrets: await get("secrets"),
    sessions: await Promise.all(
      overview.sessions.map((s) => get(`session:${s.id}`)),
    ),
    entities: await Promise.all(found.hits.map((h) => get(h.ref))),
  };
}
const checklist = {
  sections: [
    {
      name: "Auftakt",
      definition:
        "Zwei mögliche Starts als Situationen. Ich wähle einen oder bringe eigenes Material.",
    },
    {
      name: "Spuren",
      definition:
        "Zehn kurze Geheimnisse und Hinweise. Nur meine gewählten Hinweise kommen in die Notiz.",
    },
    {
      name: "Requisiten",
      definition:
        "Mechanisch: nur die Requisiten, die ich mitbringe. Keine Vorschläge.",
    },
    {
      name: "Belohnungen",
      definition:
        "Mechanisch: nur meine vorbereiteten Belohnungen. Keine Vorschläge.",
    },
  ],
  template:
    "# Nächste Sitzung: Die Talgmühle\n\n## Auftakt\n\n## Spuren\n\n## Requisiten\n\n## Belohnungen\n",
};
const picks = [
  "Am Wehr reißt ein Tau. Die Gruppe sieht eine treibende Laterne und entscheidet selbst, ob sie eingreift.",
  "Am Fenster klebt rotes Wachs. Im Keller liegt ein nasser Handschuh.",
  "Flusskarte und zwei Lehrlingsmarker liegen bereit.",
];
type Block = {
  type: string;
  name?: string;
  text?: string;
  input?: Record<string, unknown>;
};
type Event = {
  type: string;
  turn: number;
  subtype?: string;
  message?: { model?: string; content: Block[] };
};
async function verifyConversation() {
  const events = (await readFile(`${proof}/claude.jsonl`, "utf8"))
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Event);
  assert.equal(events.filter((e) => e.type === "result").length, 5);
  assert(
    events
      .filter((e) => e.type === "result")
      .every((e) => e.subtype === "success"),
  );
  const calls = events
    .filter((e) => e.type === "assistant")
    .flatMap((e) => {
      assert.equal(e.message?.model, "claude-opus-5-5");
      return (e.message?.content ?? [])
        .filter((b) => b.type === "tool_use")
        .map((b) => ({
          turn: e.turn,
          name: b.name?.split("__").at(-1),
          input: b.input ?? {},
        }));
    });
  assert(
    calls.every((c) =>
      ["get", "find", "skill", "note_write", "secret_write"].includes(
        c.name ?? "",
      ),
    ),
    "Only public MCP tools, no shell or vault",
  );
  for (const turn of [1, 4]) {
    assert(
      calls.some(
        (c) =>
          c.turn === turn &&
          c.name === "skill" &&
          c.input.name === "prep-sparring",
      ),
    );
    const refs = calls
      .filter((c) => c.turn === turn && c.name === "get")
      .flatMap((c) => [
        c.input.ref,
        ...(Array.isArray(c.input.refs) ? c.input.refs : []),
      ]);
    assert(
      refs.includes("note") && refs.includes("overview"),
      "Each fresh sitting reads the saved progress",
    );
  }
  const writes = calls.filter((c) => c.name === "note_write");
  assert.deepEqual(
    writes
      .filter((c) => c.turn <= 3)
      .map((c) => [c.input.op, c.input.section, c.input.status]),
    [
      ["upsert", "Auftakt", "done"],
      ["upsert", "Spuren", "done"],
    ],
  );
  assert(
    !writes.some((c) => c.turn === 4),
    "Fresh resume opens the next section without changing earlier picks",
  );
  assert.deepEqual(
    writes
      .filter((c) => c.turn === 5)
      .map((c) => [c.input.op, c.input.section, c.input.status]),
    [
      ["upsert", "Requisiten", "done"],
      ["upsert", "Belohnungen", "skipped"],
      ["finish", undefined, undefined],
    ],
  );
  const reply = (turn: number) => {
    let text = "";
    for (const e of events.filter(
      (e) => e.type === "assistant" && e.turn === turn,
    ))
      for (const b of e.message?.content ?? []) {
        if (b.type === "tool_use") text = "";
        if (b.type === "text") text += `\n${b.text}`;
      }
    assert(text.trim());
    return text;
  };
  assert.match(reply(4), /Requisiten/);
  assert.doesNotMatch(reply(4), /(?:##\s*Auftakt|##\s*Spuren)/);
  const finished = await note();
  assert(finished);
  assert.equal(finished.status, "finished");
  assert.deepEqual(finished.checklist, checklist);
  assert.deepEqual(finished.entries, [
    { section: "Auftakt", entry: picks[0], status: "done" },
    { section: "Spuren", entry: picks[1], status: "done" },
    { section: "Requisiten", entry: picks[2], status: "done" },
    { section: "Belohnungen", entry: "", status: "skipped" },
  ]);
  const text = reply(5);
  const begin = text.indexOf("# Nächste Sitzung: Die Talgmühle");
  assert(begin >= 0, "Finished note uses the stored markdown title");
  const markdown = text.slice(begin).split("\n```")[0].trim();
  let at = -1;
  for (const heading of [
    "# Nächste Sitzung: Die Talgmühle",
    "## Auftakt",
    "## Spuren",
    "## Requisiten",
    "## Belohnungen",
  ]) {
    const next = markdown.indexOf(heading);
    assert(next > at, `Template heading ${heading} is preserved in order`);
    at = next;
  }
  for (const pick of picks)
    assert(
      markdown.includes(pick),
      "The game master's exact words reach the finished markdown",
    );
  await writeFile(`${proof}/session-note.md`, `${markdown}\n`);
  await writeFile(
    `${proof}/finished-note.json`,
    `${JSON.stringify(finished, null, 2)}\n`,
  );
  const before = JSON.parse(
    await readFile(`${proof}/headless-before.json`, "utf8"),
  ) as Awaited<ReturnType<typeof snapshot>>;
  const after = await snapshot();
  const secrets = calls.filter((c) => c.name === "secret_write");
  assert(secrets.length === 1 || secrets.length === 2);
  assert(secrets.every((c) => c.turn === 3 && c.input.op === "write"));
  const expectedSecrets =
    secrets.length === 1
      ? [picks[1]]
      : [
          "Am Fenster klebt rotes Wachs.",
          "Im Keller liegt ein nasser Handschuh.",
        ];
  assert.deepEqual(
    secrets.map((c) => c.input.text).sort(),
    [...expectedSecrets].sort(),
    "Only the GM's exact two clues are stored, together or separately",
  );
  const savedSecrets = await get<{
    secrets: { text: string; status: string }[];
  }>("secrets");
  assert.deepEqual(
    savedSecrets.secrets.map((secret) => secret.text).sort(),
    [...expectedSecrets].sort(),
  );
  assert(savedSecrets.secrets.every((secret) => secret.status === "hidden"));
  const beforeOverview = before.overview as typeof before.overview & {
    commits: { kind: string }[];
    openSecrets: number;
  };
  const afterOverview = after.overview as typeof after.overview & {
    commits: { kind: string }[];
    openSecrets: number;
  };
  assert.deepEqual(
    afterOverview.commits.slice(0, secrets.length).map((c) => c.kind),
    Array.from({ length: secrets.length }, () => "secret"),
  );
  afterOverview.commits = afterOverview.commits.slice(secrets.length);
  assert.equal(
    afterOverview.openSecrets,
    beforeOverview.openSecrets + secrets.length,
  );
  afterOverview.openSecrets = beforeOverview.openSecrets;
  const { secrets: _afterSecrets, ...unchangedAfter } = after;
  const { secrets: _beforeSecrets, ...unchangedBefore } = before;
  assert.deepEqual(unchangedAfter, unchangedBefore);
  console.log(
    "PASS two completed sections persist across the stop; a fresh conversation reads progress and opens Requisiten without rewriting earlier picks",
  );
  console.log(
    "PASS remaining pick, skip and finish persist; clean German markdown uses the saved template and exact GM wording",
  );
  console.log(
    "PASS only the two GM clues become hidden secrets; story state, sessions, frame, schema, checklist and existing history unchanged",
  );
}
try {
  if (process.argv.includes("--before-upgrade")) {
    await writeFile(
      `${proof}/before-upgrade.json`,
      `${JSON.stringify(await snapshot(), null, 2)}\n`,
    );
    console.log("PASS existing campaign snapshot captured through MCP");
  } else if (process.argv.includes("--after-upgrade")) {
    assert.deepEqual(
      await snapshot(),
      JSON.parse(await readFile(`${proof}/before-upgrade.json`, "utf8")),
    );
    assert.equal(await note(), null);
    console.log(
      "PASS additive note schema preserves every pre-existing MCP read; no checklist means no prep note",
    );
  } else if (process.argv.includes("--seed-headless")) {
    await call("checklist_set", {
      ...checklist,
      reason: "Meine Vorbereitung in jedem Client",
    });
    const saved = await note();
    assert(saved?.entries.every((e) => e.status === "open"));
    await writeFile(
      `${proof}/headless-before.json`,
      `${JSON.stringify(await snapshot(), null, 2)}\n`,
    );
    console.log(
      "PASS invented German checklist and template stored; all four sections open",
    );
  } else if (process.argv.includes("--stopped")) {
    const saved = await note();
    assert(saved);
    assert.equal(saved.status, "in_progress");
    assert.deepEqual(saved.entries, [
      { section: "Auftakt", entry: picks[0], status: "done" },
      { section: "Spuren", entry: picks[1], status: "done" },
      { section: "Requisiten", entry: "", status: "open" },
      { section: "Belohnungen", entry: "", status: "open" },
    ]);
    const overview = await get<{ prep: unknown }>("overview");
    assert.deepEqual(overview.prep, {
      session: saved.session,
      status: "in_progress",
      done: ["Auftakt", "Spuren"],
      skipped: [],
      open: ["Requisiten", "Belohnungen"],
      nextSection: "Requisiten",
    });
    await writeFile(
      `${proof}/stopped-note.json`,
      `${JSON.stringify(saved, null, 2)}\n`,
    );
    console.log(
      "PASS independent fresh SDK reads two exact saved picks and Requisiten as the first open section after stopping",
    );
  } else {
    await verifyConversation();
  }
} finally {
  await client.close();
}
