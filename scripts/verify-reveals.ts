import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ProposedReveal, Secret, StoryChange } from "../convex/model";

const proof = "proof/reveals";
const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "omni-gm-reveals-readback", version: "1" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
console.log(`PROOF TARGET ${new URL(url).origin}`);

type Block = { type: string; text?: string; name?: string; input?: Input };
type Input = Record<string, unknown>;
type Event = { type: string; text?: string; message?: { content: Block[] } };
type Turn = { input: string; tools: Block[]; reply: string };
type Entity = {
  id: string;
  name: string;
  aliases: string[];
  properties: Record<string, string | number>;
  history: (StoryChange & { commit: string; session?: string })[];
};
type SecretRead = Secret & {
  history: {
    commit: string;
    op: string;
    session?: string;
    scene?: number;
    learned?: string;
    sources?: { quote: string; at?: string }[];
  }[];
};

async function get<T>(ref: string, cursor?: string | null): Promise<T> {
  const result = (await client.callTool({
    name: "get",
    arguments: { ref, ...(cursor ? { cursor } : {}) },
  })) as CallToolResult;
  assert(!result.isError && result.structuredContent, `get ${ref} failed`);
  return (result.structuredContent as { value: T }).value;
}
async function openSecrets(): Promise<Secret[]> {
  const all: Secret[] = [];
  let cursor: string | null = null;
  do {
    const page: { secrets: Secret[]; nextCursor: string | null } = await get(
      "secrets",
      cursor,
    );
    all.push(...page.secrets);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}
async function entities(): Promise<Entity[]> {
  const result = (await client.callTool({
    name: "find",
    arguments: { types: ["entity"], limit: 200 },
  })) as CallToolResult;
  const found = result.structuredContent as {
    hits: { ref: string }[];
    truncated: boolean;
  };
  assert(!found.truncated, "The invented fixture fits in one page");
  return Promise.all(found.hits.map((hit) => get<Entity>(hit.ref)));
}

async function conversation(file: string): Promise<Turn[]> {
  const events: Event[] = (await readFile(`${proof}/${file}`, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const turns: Turn[] = [];
  for (const event of events) {
    if (event.type === "user_input")
      turns.push({ input: event.text ?? "", tools: [], reply: "" });
    if (event.type !== "assistant") continue;
    const turn = turns.at(-1);
    assert(turn, "Every assistant message follows a game-master input");
    for (const block of event.message?.content ?? []) {
      if (block.type === "tool_use") {
        turn.tools.push({ ...block, name: tool(block.name) });
        turn.reply = "";
      }
      if (block.type === "text") turn.reply += `${block.text}\n`;
    }
  }
  return turns;
}
const tool = (name = "") => name.replace(/^mcp__[^_]+(?:-[^_]+)*__/, "");
const calls = (turn: Turn, name: string) =>
  turn.tools.filter((t) => t.name === name).map((t) => t.input ?? {});
const reveals = (turn: Turn) =>
  calls(turn, "debrief_add").flatMap(
    (input) => (input.reveals as ProposedReveal[] | undefined) ?? [],
  );
const briefings = (turn: Turn) =>
  calls(turn, "debrief_add")
    .map((input) => input.briefing)
    .filter((b): b is string => typeof b === "string" && b.trim() !== "");
const timestamp = /\b\d{1,2}:\d{2}:\d{2}\b/;
const mentions = (value: unknown, ...needles: string[]) =>
  needles.some((n) =>
    JSON.stringify(value ?? "")
      .toLowerCase()
      .includes(n),
  );
const unseenRest = ["silver", "floor"];

try {
  const ids: Record<"well" | "wenna" | "coll", string> = JSON.parse(
    ((await readFile(`${proof}/seed.log`, "utf8")).match(/^SECRETS (.*)$/m) ??
      [])[1] ?? "null",
  );
  assert(ids, "seed.log names the three seeded secrets");
  const transcript = await readFile("fixtures/reveals-session.txt", "utf8");
  const [review, answered, committed] = await conversation("debrief.jsonl");
  assert(review && answered && committed, "Three game-master turns");

  assert(
    calls(review, "skill").some((i) => mentions(i.name, "debrief")),
    "Turn one loads debrief",
  );
  assert(
    calls(review, "get").some((i) => i.ref === "secrets"),
    "Turn one reads the open secrets",
  );
  const drafted = reveals(review);
  const of = (id: string) => drafted.filter((r) => r.secret === id);
  assert.equal(of(ids.well).length, 1, "One reveal of the poisoned well");
  assert.equal(of(ids.well)[0].whole, true, "The well is revealed whole");
  assert.equal(of(ids.wenna).length, 1, "One reveal of Sister Wenna");
  assert.equal(of(ids.wenna)[0].whole, false, "Wenna is revealed in part");
  assert(
    !mentions(of(ids.wenna)[0].learned, ...unseenRest),
    `Wenna's learned keeps the unseen rest out: ${of(ids.wenna)[0].learned}`,
  );
  assert.equal(of(ids.coll).length, 0, "No reveal drafted for Coll");
  for (const r of drafted)
    for (const source of r.sources)
      assert(
        source.at && transcript.includes(`[${source.at.padStart(8, "0")}]`),
        `Reveal source with its transcript timestamp: ${JSON.stringify(source)}`,
      );
  console.log(
    `PASS turn one reads the open secrets and drafts the well whole and Wenna in part, with transcript timestamps, and no reveal for Coll (${drafted.length} reveals)`,
  );
  for (const r of drafted)
    console.log(
      `  REVEAL ${r.whole ? "whole" : "partial"} scene ${r.scene}: ${r.learned}`,
    );

  const briefing = briefings(review).at(-1) ?? "";
  const after = review.reply.slice(
    review.reply.lastIndexOf(briefing.trim().split("\n").at(-1) ?? ""),
  );
  const collQuestion = after
    .split("\n")
    .find(
      (line) =>
        /^\s*\**\d+[.)]/.test(line) &&
        line.includes("?") &&
        mentions(line, "coll") &&
        mentions(line, "lost son", "heir", "reveal", "secret") &&
        timestamp.test(line),
    );
  assert(collQuestion, "The review asks about the unsure Coll reveal");
  const questions = after
    .split("\n")
    .filter((line) => /^\s*\**\d+[.)]/.test(line) && line.includes("?"));
  assert(questions.length <= 5, `At most five questions: ${questions.length}`);
  console.log(
    `PASS the review asks about the unsure third reveal as one of ${questions.length} timestamped questions`,
  );
  console.log(`  QUESTION ${collQuestion.trim()}`);

  assert(
    !reveals(answered).some((r) => r.secret === ids.coll) &&
      !reveals(committed).some((r) => r.secret === ids.coll),
    "The answer keeps Coll unrevealed",
  );
  assert(
    !calls(review, "debrief_commit").length &&
      !calls(answered, "debrief_commit").length,
    "No commit before the game master says the draft is right",
  );
  assert.equal(calls(committed, "debrief_commit").length, 1, "Turn three");

  const overview = await get<{
    openSecrets: number;
    commits: { id: string; kind: string }[];
    sessions: { id: string; status: string }[];
  }>("overview");
  const debrief = overview.commits.find((c) => c.kind === "debrief");
  const session = overview.sessions[0];
  assert(debrief && session.status === "committed", "The debrief committed");
  const well = await get<SecretRead>(ids.well);
  const wenna = await get<SecretRead>(ids.wenna);
  const coll = await get<SecretRead>(ids.coll);
  assert.equal(well.status, "revealed");
  assert.equal(wenna.status, "partly_revealed");
  assert.equal(coll.status, "hidden");
  for (const read of [well, wenna]) {
    const entry = read.history.at(-1);
    assert(entry, `${read.id} has history`);
    assert.equal(entry.op, "reveal");
    assert.equal(entry.commit, debrief.id);
    assert.equal(entry.session, session.id);
    assert(entry.learned && entry.sources?.length && entry.scene);
  }
  assert.deepEqual(
    coll.history.map((h) => h.op),
    ["write"],
  );
  const open = await openSecrets();
  assert.deepEqual(open.map((s) => s.id).sort(), [ids.wenna, ids.coll].sort());
  assert.equal(
    open.find((s) => s.id === ids.wenna)?.text,
    "Sister Wenna leads the river smugglers and hides their silver under the chapel floor.",
  );
  assert.equal(overview.openSecrets, 2);
  console.log(
    "PASS the commit closed the well as revealed, kept Wenna partly_revealed and readable in get secrets with its text, left Coll hidden, each reveal with debrief commit, session, scene, learned and sources in its history; openSecrets is 2",
  );

  const stored = await entities();
  const committedChanges = stored.flatMap((e) =>
    e.history
      .filter((h) => h.commit === debrief.id)
      .map((h) => ({ ...h, subject: e.name })),
  );
  const learnedFacts = [
    { read: well, about: ["bram", "well"], fact: ["poison", "nightshade"] },
    { read: wenna, about: ["wenna"], fact: ["orders", "signal", "lantern"] },
  ];
  for (const { read, about, fact } of learnedFacts) {
    const at = new Set(
      read.history.at(-1)?.sources?.map((s) => s.at?.padStart(8, "0")),
    );
    const recorded = committedChanges.find(
      (h) =>
        h.sources.some((s) => at.has(s.at?.padStart(8, "0"))) &&
        mentions([h.subject, h.change], ...about) &&
        mentions(h.change, ...fact) &&
        !h.basis.every((b) => b === "player_guess" || b === "player_plan"),
    );
    assert(
      recorded,
      `What the players learned of ${read.id} is a committed story change on its transcript lines`,
    );
    console.log(
      `  LEARNED ${recorded.subject} [${recorded.basis.join(", ")}]: ${JSON.stringify(recorded.change).slice(0, 200)}`,
    );
  }
  for (const e of stored)
    assert(
      !mentions([e.name, e.aliases, e.properties], ...unseenRest),
      `The unseen rest stays out of story state: ${e.name}`,
    );
  const text = (await get<{ briefing: { text: string } }>("overview")).briefing
    .text;
  for (const line of text.split("\n"))
    assert(
      !mentions(line, ...unseenRest) || line.includes("(secret)"),
      `The briefing marks the unseen rest as secret: ${line}`,
    );
  console.log(
    `PASS what the players learned of both secrets is committed story state on the same transcript lines (${committedChanges.length} changes), and the unseen rest of Wenna's secret appears in no entity and only as a (secret) line in the briefing`,
  );
  console.log("REVEALS HEADLESS PROOF PASSED");
} finally {
  await client.close();
}
