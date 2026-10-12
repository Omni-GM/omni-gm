import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  checkFrameOfferTranscript,
  type TranscriptEvent,
} from "./frame-offer-transcript";

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
      .map((line) => JSON.parse(line) as TranscriptEvent);
    const storedBriefing = (await get<Overview>("overview")).briefing.text;
    for (const passed of checkFrameOfferTranscript(events, storedBriefing))
      console.log(passed);

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
