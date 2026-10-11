import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Infer } from "convex/values";
import type { checklistRead } from "../convex/model";

const proof = "proof/checklist";
const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "omni-gm-checklist-proof", version: "1" });
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

async function snapshot() {
  const overview = await call<{
    value: { commits: { kind: string }[]; sessions: { id: string }[] };
  }>("get", { ref: "overview" });
  const found = await call<{ hits: { ref: string }[]; truncated: boolean }>(
    "find",
    { types: ["entity"], limit: 200 },
  );
  assert(!found.truncated, "The invented fixture fits in one page");
  return {
    overview: {
      ...overview.value,
      commits: overview.value.commits.filter((c) => c.kind !== "checklist"),
    },
    frame: await call("get", { ref: "frame" }),
    schema: await call("get", { ref: "schema" }),
    entities: await Promise.all(
      found.hits.map((hit) => call("get", { ref: hit.ref })),
    ),
    sessions: await Promise.all(
      overview.value.sessions.map((s) =>
        call("get", { ref: `session:${s.id}` }),
      ),
    ),
  };
}

async function readChecklist() {
  let { value } = await call<{ value: Infer<typeof checklistRead> }>("get", {
    ref: "checklist",
  });
  const result = { checklist: value.checklist, history: [...value.history] };
  while (value.truncated) {
    assert(value.nextCursor, "Truncated history has a continuation");
    ({ value } = await call<{ value: Infer<typeof checklistRead> }>("get", {
      ref: "checklist",
      cursor: value.nextCursor,
    }));
    result.history.push(...value.history);
  }
  return result;
}

type Block = {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
};
type Event = {
  type: string;
  turn: number;
  subtype?: string;
  message?: { model?: string; content: Block[] };
};

async function verifyHeadless() {
  const events = (await readFile(`${proof}/claude.jsonl`, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Event);
  assert.equal(events.filter((e) => e.type === "result").length, 8);
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
      ["skill", "get", "find", "checklist_set"].includes(c.name ?? ""),
    ),
    "No shell, vault or other write tools were available or used",
  );
  const writes = calls.filter((c) => c.name === "checklist_set");
  assert.equal(
    writes.length,
    1,
    "Checklist is stored exactly once across the entire walk and fresh client",
  );
  assert.equal(writes[0].turn, 2);
  const checkReads = calls.filter(
    (c) =>
      c.name === "get" &&
      (c.input.ref === "checklist" ||
        (Array.isArray(c.input.refs) && c.input.refs.includes("checklist"))),
  );
  assert(
    checkReads.some((c) => c.turn === 1),
    "Missing checklist is read before asking",
  );
  const savedIndex = calls.indexOf(writes[0]);
  assert(
    calls
      .slice(savedIndex + 1)
      .some((c) => c.turn === 2 && checkReads.includes(c)),
    "Saved checklist is confirmed before walking",
  );
  assert(
    checkReads.some((c) => c.turn === 8),
    "Fresh no-vault client reads the stored checklist",
  );
  assert(
    calls.some(
      (c) =>
        c.turn === 1 && c.name === "skill" && c.input.name === "prep-sparring",
    ),
  );
  assert(
    calls.some(
      (c) =>
        c.turn === 8 && c.name === "skill" && c.input.name === "prep-sparring",
    ),
  );

  const reply = (turn: number) => {
    let text = "";
    for (const e of events.filter(
      (e) => e.type === "assistant" && e.turn === turn,
    )) {
      for (const b of e.message?.content ?? []) {
        if (b.type === "tool_use") text = "";
        if (b.type === "text") text += `\n${b.text}`;
      }
    }
    assert(text.trim(), `Turn ${turn} ends with visible text`);
    return text;
  };
  assert.match(
    reply(1),
    /paste|provide|send/i,
    "Missing checklist is requested once",
  );
  for (const turn of [2, 3, 4, 5, 6, 7, 8])
    assert.doesNotMatch(
      reply(turn),
      /(?:paste|provide|send|give me|what is|what's).{0,60}(?:checklist|template)/i,
      "Stored checklist and template are never requested again",
    );
  assert.match(reply(2), /launch/i);
  assert.doesNotMatch(
    reply(2),
    /#{1,3}\s+Discoveries/i,
    "Launch is walked before Discoveries",
  );
  assert.equal(
    (reply(2).match(/built on/gi) ?? []).length,
    2,
    "Launch definition asks for exactly two situations",
  );
  assert.match(reply(4), /discoveries/i);
  const discoveryItems = [
    ...reply(4).matchAll(/^\s*(\d+)[.)]\s+(.+)(?:\n(?!\s*\d+[.)])[\t ]+.*)*/gm),
  ];
  const sources = JSON.parse(
    await readFile(`${proof}/headless-before.json`, "utf8"),
  ) as { entities: { value: { name: string } }[] };
  assert.deepEqual(
    discoveryItems.map((m) => Number(m[1])),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    "Discoveries definition asks for ten numbered clues",
  );
  for (const item of discoveryItems) {
    assert(
      item[2].replace(/\[[^\]]*\]/g, "").split(/\s+/).length <= 45,
      "Each clue is tweet-short",
    );
    assert(
      /\d{2}:\d{2}:\d{2}/.test(item[0]) ||
        sources.entities.some((e) =>
          item[0].toLowerCase().includes(e.value.name.toLowerCase()),
        ),
      "Every clue names its source",
    );
  }
  assert.match(reply(6), /supplies/i);
  assert.doesNotMatch(
    reply(6),
    /\bbuilt on\b|pitch [123]/i,
    "Mechanical Supplies has no pitches",
  );
  assert.match(reply(6), /river map/i);
  assert.match(reply(6), /apprentice tokens/i);
  assert.match(reply(8), /launch/i);
  assert.equal(
    (reply(8).match(/built on/gi) ?? []).length,
    2,
    "Fresh client uses Launch definition without a pasted checklist",
  );
  console.log(
    "PASS loaded the section-walk procedure; missing checklist requested once, stored once, confirmed and reused by a fresh no-vault client",
  );
  console.log(
    "PASS Launch, Discoveries and Supplies walked in stored order; exactly two sourced situations, ten short sourced clues, then mechanical supplies with no pitches",
  );

  const value = await readChecklist();
  const expected = {
    sections: [
      {
        name: "Launch",
        definition:
          "the strong start. Give exactly two opening situations, never an outcome, close to where the last session ended.",
      },
      {
        name: "Discoveries",
        definition:
          "ten numbered, tweet-short secrets and clues in the Lazy DM style that the characters could learn next session. Small truths I can drop wherever they fit.",
      },
      {
        name: "Supplies",
        definition:
          "a mechanical section for the props and stat blocks I already have ready. No pitches. Keep only what I supply.",
      },
    ],
    template:
      "# Next session of The Tallow Mill\n## Launch\n## Discoveries\n## Supplies",
  };
  assert.deepEqual(
    value.checklist,
    expected,
    "Exact game-master words, order and template are stored",
  );
  assert.equal(value.history.length, 1);
  assert.equal(value.history[0].before, null);
  assert.equal(value.history[0].reason, "Use my prep process in every client");
  assert.deepEqual(value.history[0].after, expected);
  assert.deepEqual(
    await snapshot(),
    JSON.parse(await readFile(`${proof}/headless-before.json`, "utf8")),
  );
  const note = reply(7);
  const headings = [
    "# Next session of The Tallow Mill",
    "## Launch",
    "## Discoveries",
    "## Supplies",
  ];
  let at = -1;
  for (const heading of headings) {
    const next = note.indexOf(heading);
    assert(next > at, `Note uses template heading ${heading} in order`);
    at = next;
  }
  await writeFile(
    `${proof}/session-note.md`,
    `${note.slice(note.indexOf(headings[0])).split("\n```")[0].trim()}\n`,
  );
  await writeFile(
    `${proof}/headless-checklist.json`,
    `${JSON.stringify(value, null, 2)}\n`,
  );
  console.log(
    "PASS independent MCP readback preserves exact definitions and template with one reasoned initial write; story state, frame, schema and sessions unchanged",
  );
  console.log(
    "PASS session note assembled with the stored template headings in order",
  );
  console.log("HEADLESS CHECKLIST WALK PASSED");
}

try {
  if (process.argv.includes("--before-upgrade")) {
    await writeFile(
      `${proof}/sdk-before-upgrade.json`,
      `${JSON.stringify(await snapshot(), null, 2)}\n`,
    );
    console.log(
      "PASS captured pre-existing campaigns, adventures, sessions, commits, entities, frame and schema through MCP",
    );
  } else if (process.argv.includes("--after-upgrade")) {
    assert.deepEqual(
      await snapshot(),
      JSON.parse(await readFile(`${proof}/sdk-before-upgrade.json`, "utf8")),
    );
    const { value } = await call<{ value: Infer<typeof checklistRead> }>(
      "get",
      { ref: "checklist" },
    );
    assert.equal(value.checklist, null);
    assert.deepEqual(value.history, []);
    console.log(
      "PASS additive schema deployed over existing records, all pre-existing MCP readback unchanged; checklist unset",
    );
  } else if (process.argv.includes("--headless-before")) {
    const { value } = await call<{ value: Infer<typeof checklistRead> }>(
      "get",
      { ref: "checklist" },
    );
    assert.equal(value.checklist, null);
    await writeFile(
      `${proof}/headless-before.json`,
      `${JSON.stringify(await snapshot(), null, 2)}\n`,
    );
    console.log("PASS fresh headless preview has no stored checklist");
  } else if (process.argv.includes("--headless-after")) {
    await verifyHeadless();
  } else {
    const before = await snapshot();
    const previous = await readChecklist();
    const original = {
      sections: [
        { name: "Opening", definition: "Two opening situations" },
        { name: "Discoveries", definition: "Ten short clues" },
      ],
      template: "# Invented session\n## Opening\n## Discoveries",
    };
    const first = await call<{ commit: string }>("checklist_set", {
      ...original,
      reason: "Invented SDK prep process",
    });
    const replacement = {
      sections: [...original.sections].reverse(),
      template: "# Revised session\n## Discoveries\n## Opening",
    };
    const second = await call<{ commit: string }>("checklist_set", {
      ...replacement,
      reason: "Clues come first",
    });
    const value = await readChecklist();
    assert.deepEqual(value.checklist, replacement);
    assert.deepEqual(value.history.slice(-2), [
      {
        commit: first.commit,
        reason: "Invented SDK prep process",
        before: previous.checklist,
        after: original,
      },
      {
        commit: second.commit,
        reason: "Clues come first",
        before: original,
        after: replacement,
      },
    ]);
    console.log(
      "PASS stored order, definitions and template; replacement retains prior version and both reasons",
    );
    for (const invalid of [
      { sections: [] },
      { sections: [{ name: " ", definition: "Opening" }] },
      {
        sections: [
          { name: "Opening", definition: "One" },
          { name: " opening ", definition: "Two" },
        ],
      },
      { template: "界".repeat(11_000) },
    ]) {
      const rejected = await client.callTool({
        name: "checklist_set",
        arguments: {
          ...replacement,
          reason: "Invalid replacement",
          ...invalid,
        },
      });
      assert(rejected.isError, "Invalid checklist must be rejected");
      assert.deepEqual(await readChecklist(), value);
    }
    console.log(
      "PASS no sections, blank names, duplicate names and oversized UTF-8 rejected without any write",
    );
    assert.deepEqual(await snapshot(), before);
    console.log(
      "PASS pre-existing story state, frame, schema, sessions and non-checklist history unchanged",
    );
    console.log("CHECKLIST SDK E2E PASSED");
  }
} finally {
  await client.close();
}
