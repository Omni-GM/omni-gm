import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { StoryChange } from "../convex/model";

const proof = "proof/debrief-briefing";
const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "omni-gm-debrief-readback", version: "1" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
console.log(`PROOF TARGET ${new URL(url).origin}`);

async function get<T>(ref: string): Promise<T> {
  const result = (await client.callTool({
    name: "get",
    arguments: { ref },
  })) as CallToolResult;
  assert(!result.isError && result.structuredContent, `get ${ref} failed`);
  return (result.structuredContent as { value: T }).value;
}
async function entitiesOf(kind: string): Promise<Entity[]> {
  const result = (await client.callTool({
    name: "find",
    arguments: { types: ["entity"], kinds: [kind], limit: 200 },
  })) as CallToolResult;
  const found = result.structuredContent as {
    hits: { ref: string }[];
    truncated: boolean;
  };
  assert(!found.truncated, "The invented fixture fits in one page");
  return Promise.all(found.hits.map((hit) => get<Entity>(hit.ref)));
}

type Entity = {
  id: string;
  name: string;
  properties: Record<string, string | number>;
  relationships: { type: string; from: string; to: string }[];
  history: (StoryChange & { session?: string })[];
};
type Block = {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: unknown;
};
type Event = {
  type: string;
  turn?: number;
  text?: string;
  message?: { content: Block[] };
};
type Turn = { input: string; tools: Block[]; reply: string };
type Proposed = { scene: number } & StoryChange;

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
const skills = (turn: Turn) =>
  calls(turn, "skill").map((input) => String(input.name).toLowerCase());
const plain = (line: string) =>
  line
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const words = (text: string) =>
  text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const timestamp = /\b\d{1,2}:\d{2}:\d{2}\b/;
const parts = [
  "where the party stands",
  "what pulls",
  "forgotten threads",
  "npcs in play",
  "clocks and pressure",
  "off-screen moves",
  "what next",
];

function headingLine(text: string, part: string): number {
  return text
    .split("\n")
    .findIndex((line) => plain(line).toLowerCase().startsWith(part));
}
function briefingParts(text: string): number[] {
  return parts.map((part) => headingLine(text, part));
}
function inOrder(positions: number[]): boolean {
  return positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1]));
}
function units(text: string): string[] {
  const found: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      found.push("");
      continue;
    }
    const starts = /^\s*([-*•]|\**\d+[.)])/.test(line) || found.at(-1) === "";
    if (starts || !found.length) found.push(line.trim());
    else found[found.length - 1] += ` ${line.trim()}`;
  }
  return found.filter((unit) => /\p{L}/u.test(unit));
}
const isHeading = (unit: string) =>
  /^\s*(#+\s.*|\*\*[^*]+\*\*:?)\s*$/.test(unit);
const unquoted = (text: string) => text.replace(/["“][^"”]*["”]/g, "");
const questionMarks = (text: string) =>
  (unquoted(text).match(/\?/g) ?? []).length;
function reviewShape(turn: Turn, briefing: string) {
  for (const line of briefing.split("\n").filter((l) => plain(l)))
    assert(
      plain(turn.reply).includes(plain(line)),
      `The review shows the stored draft briefing line: ${line}`,
    );
  const lines = turn.reply.split("\n");
  const start = headingLine(turn.reply, parts[0]);
  const preamble = lines.slice(0, start).filter((l) => /\p{L}/u.test(l));
  assert(
    preamble.length <= 1,
    `At most one line before the briefing: ${preamble.join(" / ")}`,
  );
  const last = plain(briefing.trim().split("\n").at(-1) ?? "");
  const end =
    lines.length -
    1 -
    [...lines].reverse().findIndex((line) => plain(line).includes(last));
  const after = lines.slice(end + 1).join("\n");
  const questions = units(after).filter(
    (u) => questionMarks(u) > 0 && !isHeading(u),
  );
  for (const q of questions) {
    assert.equal(questionMarks(q), 1, `One question per item: ${q}`);
    assert(timestamp.test(q), `Question without a timestamp: ${q}`);
  }
  assert(questions.length <= 5, `At most five questions, ${questions.length}`);
  const rest = words(preamble.join(" ")) + words(after);
  assert(rest <= 300, `The review adds only questions and options, ${rest}`);
  assert(
    !/\b(c\d+|tempKey|op:|basis:)/.test(turn.reply),
    "No per-change detail before it is asked for",
  );
  return { questions, rest };
}
function proposed(turn: Turn): Proposed[] {
  return calls(turn, "debrief_add").flatMap(
    (input) => (input.changes as Proposed[] | undefined) ?? [],
  );
}
function storedBriefings(turn: Turn): string[] {
  return calls(turn, "debrief_add")
    .map((input) => input.briefing)
    .filter((b): b is string => typeof b === "string" && b.trim() !== "");
}
const mentions = (value: unknown, ...needles: string[]) =>
  needles.every((n) =>
    String(value ?? "")
      .toLowerCase()
      .includes(n),
  );

try {
  const [review, answered, committed] = await conversation("debrief.jsonl");
  const [prep] = await conversation("prep.jsonl");
  assert(review && answered && committed && prep, "Four game-master turns");

  assert(skills(review).includes("debrief"), "Turn one loads debrief");
  assert(skills(review).includes("briefing"), "Turn one loads briefing");
  const drafted = proposed(review);
  const tempNames = new Map(
    drafted.flatMap((c) =>
      c.change.op === "new" && c.change.tempKey
        ? [[`$${c.change.tempKey}`, c.change.name]]
        : [],
    ),
  );
  const subject = (c: Proposed) =>
    c.change.op === "new"
      ? c.change.name
      : c.change.op === "update"
        ? (tempNames.get(c.change.entity) ?? c.change.entity)
        : "";
  const newClock = drafted.find(
    (c) =>
      c.change.op === "new" &&
      c.change.kind === "clock" &&
      mentions(JSON.stringify(c.change), "tide"),
  );
  assert(newClock, "The debrief drafts a clock for the named spring tide");
  assert(
    drafted.some(
      (c) => c.change.op === "relate" && c.change.type === "pressures",
    ),
    "The tide clock pressures its thread",
  );
  for (const [npc, partner] of [
    ["hedda", "osric"],
    ["osric", "hedda"],
  ])
    assert(
      drafted.some(
        (c) =>
          mentions(subject(c), npc) &&
          "properties" in c.change &&
          mentions(c.change.properties?.relationships, partner),
      ),
      `The debrief drafts ${npc}'s tie to ${partner}`,
    );
  assert(
    drafted.some(
      (c) =>
        c.basis.includes("npc_said") &&
        "properties" in c.change &&
        mentions(c.change.properties?.whatIsOpen, "bell"),
    ),
    "The debrief drafts Hedda's condition into whatIsOpen with npc_said",
  );
  console.log(
    `PASS turn one drafts a tide clock that pressures its thread, both Brask ties and the bell condition with npc_said (${drafted.length} changes)`,
  );

  const firstBriefing = storedBriefings(review).at(-1);
  assert(firstBriefing, "Turn one stores a draft briefing with debrief_add");
  assert(
    inOrder(briefingParts(firstBriefing)),
    `The draft briefing has its parts in order: ${briefingParts(firstBriefing)}`,
  );
  assert(!questionMarks(firstBriefing), "The briefing itself asks nothing");
  const { questions, rest } = reviewShape(review, firstBriefing);
  assert(questions.length >= 1, "The review asks about the planted gaps");
  console.log(
    `PASS the review is the stored draft briefing (${words(firstBriefing)} words, parts in order), at most one line before it, then ${questions.length} questions, one per item, each timestamped, and ${rest} words besides the briefing, no per-change detail`,
  );
  for (const q of questions) console.log(`  QUESTION ${q}`);

  const answers = proposed(answered);
  assert(answers.length > 0, "Answers become draft changes");
  const gameMasterSaid = plain(answered.input);
  for (const answer of answers)
    assert(
      answer.basis.includes("game_master") &&
        answer.sources.some((s) => gameMasterSaid.includes(plain(s.quote))),
      `Answer change without basis game_master and the game master's words: ${JSON.stringify(answer.change)}`,
    );
  const revised = storedBriefings(answered).at(-1);
  assert(revised && revised !== firstBriefing, "Answers revise the briefing");
  assert(inOrder(briefingParts(revised)), "The revised briefing keeps order");
  const again = reviewShape(answered, revised);
  console.log(
    `PASS all ${answers.length} answer changes carry basis game_master with the game master's words as a source; the review shows the revised briefing again in the same shape, ${again.questions.length} questions still open and ${again.rest} words besides the briefing, without listing the answer changes`,
  );

  const commits = calls(committed, "debrief_commit");
  assert.equal(commits.length, 1, "Turn three commits once");
  assert(
    !calls(review, "debrief_commit").length &&
      !calls(answered, "debrief_commit").length,
    "No commit before the game master says the draft is right",
  );
  const overview = await get<{
    sessions: { id: string; status: string }[];
    commits: { id: string; kind: string }[];
    briefing: {
      session: string;
      commit: string;
      text: string;
      correctionsSince: { commit: string; reason: string }[];
    } | null;
  }>("overview");
  const stored = overview.briefing;
  assert(stored, "get overview returns the stored briefing");
  const lastDraft = [review, answered, committed]
    .flatMap(storedBriefings)
    .at(-1);
  assert.equal(stored.text, lastDraft);
  assert.equal(
    stored.commit,
    overview.commits.find((c) => c.kind === "debrief")?.id,
  );
  assert.equal(
    overview.sessions.find((s) => s.id === stored.session)?.status,
    "committed",
  );
  console.log(
    `PASS get overview returns the committed briefing, the last draft briefing stored with debrief_add (${words(stored.text)} words)`,
  );

  const [hedda] = (await entitiesOf("npc")).filter((n) =>
    mentions(n.name, "hedda"),
  );
  const [osric] = (await entitiesOf("npc")).filter((n) =>
    mentions(n.name, "osric"),
  );
  assert(hedda && osric, "Both Brasks are stored NPCs");
  assert(mentions(hedda.properties.relationships, "osric"));
  assert(mentions(osric.properties.relationships, "hedda"));
  const threads = await entitiesOf("thread");
  const ledger = threads.find((t) => mentions(t.properties.whatIsOpen, "bell"));
  assert(ledger, "A thread holds the bell condition in whatIsOpen");
  assert(
    ledger.history.some(
      (h) =>
        h.basis.includes("npc_said") &&
        "properties" in h.change &&
        mentions(h.change.properties?.whatIsOpen, "bell"),
    ),
    "The condition is recorded with basis npc_said",
  );
  const clocks = await entitiesOf("clock");
  const tide = clocks.find((c) =>
    mentions(JSON.stringify([c.name, c.properties]), "tide"),
  );
  assert(tide, "The tide is a stored clock");
  const pressured = tide.relationships.filter(
    (r) => r.type === "pressures" && r.from === tide.id,
  );
  assert(
    pressured.some((r) => threads.some((t) => t.id === r.to)),
    "The tide clock pressures a thread",
  );
  console.log(
    `PASS the store holds Hedda's and Osric's ties, "${ledger.name}" with the bell condition on npc_said, and the "${tide.name}" clock pressuring a thread`,
  );

  assert.equal(stored.correctionsSince.length, 1);
  const [correction] = stored.correctionsSince;
  assert.equal(skills(prep)[0], "briefing", "Prep opens with the briefing");
  for (const t of prep.tools) {
    assert(["skill", "get"].includes(t.name ?? ""), `Prep called ${t.name}`);
    if (t.name === "get")
      assert(
        ["overview", "frame"].includes(String(t.input?.ref)),
        `Prep reread ${String(t.input?.ref ?? t.input?.refs)}`,
      );
  }
  const shown = plain(prep.reply);
  for (const line of stored.text.split("\n").filter((l) => plain(l)))
    assert(shown.includes(plain(line)), `Prep shows the stored line: ${line}`);
  const since = headingLine(prep.reply, "since the debrief");
  assert(since >= 0, "Prep adds a Since the debrief part");
  assert(
    since < headingLine(prep.reply, "what next"),
    "Since the debrief comes before What next",
  );
  assert(mentions(prep.reply, "gull point"), correction.reason);
  console.log(
    `PASS the next prep opens with the stored briefing word for word, reads only ${prep.tools.map((t) => `${t.name} ${String(t.input?.name ?? t.input?.ref ?? "")}`.trim()).join(", ")}, and adds the correction written since before What next`,
  );
  console.log("DEBRIEF BRIEFING HEADLESS PROOF PASSED");
} finally {
  await client.close();
}
