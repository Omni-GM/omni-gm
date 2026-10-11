import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Entity, History } from "../convex/model";

const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "omni-gm-sparring-readback", version: "1" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
console.log(`PROOF TARGET ${new URL(url).origin}`);
async function call<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = (await client.callTool({
    name,
    arguments: args,
  })) as CallToolResult;
  assert(!result.isError && result.structuredContent, `${name} failed`);
  return result.structuredContent as T;
}
type Stored = Entity & {
  history: History[];
  relationships: unknown[];
  truncated: boolean;
  nextCursor: string | null;
};
type Overview = {
  frame: unknown;
  lastTime: string;
  sessions: { id: string }[];
  commits: { kind: string; id: string; reason: string }[];
};
async function snapshot(): Promise<{
  overview: Overview;
  schema: unknown;
  entities: Stored[];
  sessions: unknown[];
}> {
  const overview = (await call<{ value: Overview }>("get", { ref: "overview" }))
    .value;
  const found = await call<{ hits: { ref: string }[]; truncated: boolean }>(
    "find",
    { types: ["entity"], limit: 200 },
  );
  assert(!found.truncated, "This small invented fixture must fit in one page");
  const entities = [];
  for (const hit of found.hits) {
    const saved = (await call<{ value: Stored }>("get", { ref: hit.ref }))
      .value;
    assert(
      !saved.truncated,
      "This fixture's entity history must fit in one page",
    );
    entities.push(saved);
  }
  return {
    overview,
    schema: await call("get", { ref: "schema" }),
    entities,
    sessions: await Promise.all(
      overview.sessions.map((s) => call("get", { ref: `session:${s.id}` })),
    ),
  };
}
type Block = {
  type: string;
  name?: string;
  input?: Record<string, unknown>;
  text?: string;
};
type Event = {
  type: string;
  subtype?: string;
  message?: { model?: string; content: Block[] };
};
try {
  if (process.argv.includes("--before")) {
    await writeFile(
      "proof/prep-sparring/claude-before.json",
      `${JSON.stringify(await snapshot(), null, 2)}\n`,
    );
    console.log(
      "PASS captured the invented story state, frame, sessions and schema before sparring",
    );
  } else {
    const events = (await readFile("proof/prep-sparring/claude.jsonl", "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Event);
    const calls: { name: string; input: Record<string, unknown> }[] = [];
    const texts: string[] = [];
    for (const event of events) {
      if (event.type === "user")
        assert(
          !JSON.stringify(event).includes("system-reminder") &&
            !JSON.stringify(event).includes("Stop hook feedback"),
          "No operator reminders in the proof",
        );
      if (event.type !== "assistant") continue;
      assert.equal(event.message?.model, "claude-opus-5-5");
      for (const block of event.message.content) {
        if (block.type === "tool_use") {
          assert(block.name && block.input);
          calls.push({ name: block.name, input: block.input });
        }
        if (block.type === "text") {
          assert(block.text);
          texts.push(block.text);
        }
      }
    }
    assert.equal(events.at(-1)?.subtype, "success");
    const normalized = (name: unknown): string =>
      String(name).toLowerCase().trim().replace(/[ _]+/g, "-");
    const prep = calls.findIndex(
      (c) =>
        c.name.endsWith("__skill") &&
        normalized(c.input.name) === "prep-sparring",
    );
    const plank = calls.findIndex(
      (c) =>
        c.name.endsWith("__skill") &&
        normalized(c.input.name) === "plank-questions",
    );
    const writes = calls
      .map((c, index) => ({ ...c, index }))
      .filter((c) => c.name.endsWith("__story_commit"));
    assert(
      prep >= 0 &&
        plank > prep &&
        writes.length === 1 &&
        writes[0].index > plank,
    );
    assert(
      calls.every((c) =>
        ["skill", "get", "find", "story_commit"].some((name) =>
          c.name.endsWith(`__${name}`),
        ),
      ),
      "Sparring may only write the plank answer",
    );
    const refs = calls
      .filter((c) => c.name.endsWith("__get"))
      .flatMap((c) => [
        c.input.ref,
        ...(Array.isArray(c.input.refs) ? c.input.refs : []),
      ]);
    assert(refs.includes("overview") && refs.includes("frame"));
    console.log(
      "PASS loaded prep-sparring and plank-questions before the one story write; read frame and latest debrief; no prep decisions stored",
    );
    const before = JSON.parse(
      await readFile("proof/prep-sparring/claude-before.json", "utf8"),
    ) as Awaited<ReturnType<typeof snapshot>>;
    const after = await snapshot();
    assert.deepEqual(after.schema, before.schema);
    assert.deepEqual(after.sessions, before.sessions);
    assert.deepEqual(after.overview.frame, before.overview.frame);
    assert.equal(after.overview.lastTime, before.overview.lastTime);
    assert.equal(
      after.overview.commits.length,
      before.overview.commits.length + 1,
    );
    assert.equal(after.overview.commits[0].kind, "story");
    assert.equal(after.entities.length, before.entities.length);
    const mira = after.entities.find((e) => e.name === "Mira");
    const earlier = before.entities.find((e) => e.name === "Mira");
    assert(mira && earlier);
    const answer = "Mira wants the seal returned before the fourth bell.";
    assert.equal(
      mira.properties.wants,
      "The seal returned before the fourth bell",
    );
    const history = mira.history.at(-1);
    assert(history);
    assert.deepEqual(history.basis, ["game_master"]);
    assert.deepEqual(history.sources, [{ quote: answer }]);
    assert.equal(history.commit, after.overview.commits[0].id);
    assert.equal(mira.history.length, earlier.history.length + 1);
    assert.deepEqual(mira.history.slice(0, -1), earlier.history);
    assert.deepEqual(
      { ...mira, properties: earlier.properties, history: earlier.history },
      earlier,
    );
    for (const entity of after.entities.filter((e) => e.id !== mira.id))
      assert.deepEqual(
        entity,
        before.entities.find((e) => e.id === entity.id),
      );
    console.log(
      "PASS exact plank answer and game_master basis independently read back; player guess stays open; all other state and history unchanged",
    );
    const note = texts.at(-1);
    assert(note);
    assert(note.includes("# Next session"));
    const lines = note.slice(note.indexOf("# Next session")).split("\n");
    const end = lines.reduce(
      (last, line, index) => (/^\s*[-*] /.test(line) ? index : last),
      -1,
    );
    const sessionNote = lines
      .slice(0, end + 1)
      .join("\n")
      .trim();
    let bullets = 0;
    for (const line of sessionNote.split("\n")) {
      if (line.startsWith("## ")) bullets = 0;
      if (/^\s*[-*] /.test(line)) {
        bullets++;
        assert(
          bullets <= 5,
          "At most five bullets per section, including nested bullets",
        );
      }
    }
    for (const detail of [
      "rain taps the brass roof",
      "wet rope smells of river mud",
      "green light shivers on the water",
    ])
      assert(sessionNote.toLowerCase().includes(detail));
    assert(sessionNote.toLowerCase().includes("missing"));
    assert(
      !sessionNote.includes("1/4") &&
        !sessionNote.includes("seal opens the ferry"),
      "Do not add recalled facts the GM did not choose",
    );
    await writeFile("proof/prep-sparring/session-note.md", `${sessionNote}\n`);
    assert(
      note.includes("## Strong start") &&
        note.includes("## Places") &&
        note.includes("## Main-plot background"),
    );
    console.log(
      "PASS note uses the invented GM template; full conversation and extracted note retained for content and proposal review",
    );
    console.log("HEADLESS PREP SPARRING READBACK PASSED");
  }
} finally {
  await client.close();
}
