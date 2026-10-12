import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "omni-gm-frame-offer", version: "1" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
console.log(`PROOF TARGET ${new URL(url).origin}`);
const proofDir = "proof/frame-offer";
const checklist = {
  sections: [
    {
      name: "Strong start",
      definition:
        "The opening scene of the next session. Drop the characters into action in the first five minutes, close to where the last session ended. A situation, never a plot.",
    },
    {
      name: "Secrets and clues",
      definition:
        "Ten secrets and clues the characters could discover next session, each a single short sentence the characters want to know.",
    },
  ],
  template:
    "# Session 2 – The Tallow Mill\n## Strong start\n## Secrets and clues\n",
};
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
  return (await call<{ value: T }>("get", { ref })).value;
}
type Overview = {
  frame: { fields: Record<string, string>; currency: string };
  briefing: { text: string };
  sessions: { id: string }[];
};
type Frame = {
  fields: Record<string, string>;
  history: { reason: string; after: Record<string, string> }[];
};
async function story(): Promise<unknown> {
  const found = await call<{ hits: { ref: string }[] }>("find", {
    types: ["entity"],
    limit: 200,
  });
  const overview = await get<Overview>("overview");
  return {
    found,
    entities: await Promise.all(found.hits.map((hit) => get(hit.ref))),
    sessions: await Promise.all(
      overview.sessions.map((s) => get(`session:${s.id}`)),
    ),
    schema: await get("schema"),
    briefing: overview.briefing,
    checklist: await get("checklist"),
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
  message?: { model?: string; content: Block[] | string };
};
type Turn = {
  calls: { name: string; input: Record<string, unknown> }[];
  text: string;
};
function turnsOf(events: Event[]): Turn[] {
  const turns: Turn[] = [{ calls: [], text: "" }];
  for (const event of events) {
    const turn = turns[turns.length - 1];
    if (event.type === "result") {
      assert.equal(event.subtype, "success");
      turns.push({ calls: [], text: "" });
    }
    if (event.type !== "assistant") continue;
    assert.equal(event.message?.model, "claude-opus-5-5");
    assert(Array.isArray(event.message.content));
    for (const block of event.message.content) {
      if (block.type === "tool_use" && block.name && block.input)
        turn.calls.push({ name: block.name, input: block.input });
      if (block.type === "text" && block.text) turn.text += `${block.text}\n`;
    }
  }
  return turns.filter((turn) => turn.text || turn.calls.length);
}
const tool = (call: { name: string }) => call.name.split("__").at(-1) ?? "";
const skillName = (call: { input: Record<string, unknown> }) =>
  String(call.input.name ?? "")
    .toLowerCase()
    .replace(/[ _]+/g, "-");
const loadedSkill = (turn: Turn) =>
  turn.calls.filter((call) => tool(call) === "skill").map(skillName);
function whatNextOptions(text: string): string[] {
  const part = text.slice(text.lastIndexOf("What next"));
  return part
    .split("\n")
    .filter((line) => /^\s*\d[.)]/.test(line))
    .map((line) => line.trim());
}
const questions = (text: string) => text.match(/[^.!?\n]*\?/g) ?? [];

try {
  if (process.argv.includes("--before")) {
    const overview = await get<Overview>("overview");
    assert.equal(overview.frame.currency, "missing");
    assert.deepEqual(overview.frame.fields, {});
    assert(!/frame talk/i.test(overview.briefing.text));
    console.log(
      "PASS the invented campaign has no frame, and its stored briefing offers no frame talk",
    );
    await call("checklist_set", {
      ...checklist,
      reason: "My invented prep checklist for the proof",
    });
    console.log("PASS stored the invented prep checklist");
    await writeFile(
      `${proofDir}/claude-before.json`,
      `${JSON.stringify(await story(), null, 2)}\n`,
    );
    console.log("PASS captured the story state before prep");
  } else {
    const events = (await readFile(`${proofDir}/claude.jsonl`, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Event);
    const turns = turnsOf(events);
    assert.equal(turns.length, 5);
    const [briefing, pick, ...answers] = turns;

    assert.deepEqual(loadedSkill(briefing), ["briefing"]);
    assert(
      briefing.calls.every((c) => ["skill", "get", "find"].includes(tool(c))),
    );
    assert(briefing.text.includes("Holloway calls at the mill"));
    const options = whatNextOptions(briefing.text);
    assert(options.length >= 2 && options.length <= 4, options.join(" | "));
    assert.match(options[0], /frame talk/i);
    assert(options.slice(1).some((o) => /checklist|first section/i.test(o)));
    console.log(
      `PASS prep opened with the stored briefing and its what-next options lead with the short frame talk: ${options[0]}`,
    );

    assert(loadedSkill(pick).includes("frame-talk"));
    for (const turn of [pick, ...answers.slice(0, -1)]) {
      const asked = questions(turn.text);
      assert.equal(asked.length, 1, turn.text);
      assert.doesNotMatch(asked[0], /finale|pressure|next session/i);
    }
    console.log(
      "PASS frame-talk loaded on the pick; each frame-talk turn asks exactly one question and starts no optional topic",
    );

    const writes = turns.flatMap((turn, index) =>
      turn.calls
        .filter(
          (c) => tool(c) !== "skill" && !["get", "find"].includes(tool(c)),
        )
        .map((c) => ({ tool: tool(c), index })),
    );
    assert(writes.length > 0);
    assert(writes.every((w) => w.tool === "frame_update" && w.index >= 2));
    const last = answers[answers.length - 1];
    const lastWrite = last.calls.map(tool).lastIndexOf("frame_update");
    assert(lastWrite >= 0);
    assert(
      last.calls
        .slice(lastWrite + 1)
        .some((c) => tool(c) === "skill" && skillName(c) === "prep-sparring"),
    );
    assert(last.text.includes("Strong start"));
    console.log(
      "PASS only frame_update wrote, after the answers, then prep-sparring took the game master back to the first section",
    );

    const frame = await get<Frame>("frame");
    assert.deepEqual(Object.keys(frame.fields).sort(), [
      "goal",
      "stakes",
      "timeframe",
    ]);
    assert.match(
      frame.fields.goal,
      /[Ff]ind Pell and Nia and learn who took them/,
    );
    assert.match(
      frame.fields.stakes,
      /the apprentices vanish downriver for good and the mill closes; if they succeed, the widow keeps her mill/,
    );
    assert.match(
      frame.fields.timeframe,
      /[Bb]efore the harvest fair opens, three days from now/,
    );
    assert(frame.history.every((h) => h.reason.trim()));
    const overview = await get<Overview>("overview");
    assert.equal(overview.frame.currency, "current");
    console.log(
      `PASS the frame names goal, stakes and timeframe in the game master's words and is current: ${JSON.stringify(frame.fields)}`,
    );

    assert.deepEqual(
      await story(),
      JSON.parse(await readFile(`${proofDir}/claude-before.json`, "utf8")),
    );
    console.log("PASS story state, briefing and checklist are unchanged");
    console.log("HEADLESS FRAME OFFER PROOF PASSED");
  }
} finally {
  await client.close();
}
