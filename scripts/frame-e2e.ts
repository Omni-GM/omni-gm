import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "omni-gm-frame-proof", version: "1" });
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
type Frame = {
  adventure: string;
  fields: Record<string, string>;
  history: {
    kind: string;
    reason: string;
    before: Record<string, string>;
    after: Record<string, string>;
  }[];
};
type Overview = {
  frame: Omit<Frame, "history">;
  currentAdventure: string;
  lastTime: string;
  sessions: { id: string }[];
};
async function story(): Promise<unknown> {
  const found = await call<{ hits: { ref: string }[] }>("find", {
    types: ["entity"],
    limit: 200,
  });
  const overview = await call<{ value: Overview }>("get", { ref: "overview" });
  return {
    found,
    entities: await Promise.all(
      found.hits.map((hit) => call("get", { ref: hit.ref })),
    ),
    sessions: await Promise.all(
      overview.value.sessions.map((s) =>
        call("get", { ref: `session:${s.id}` }),
      ),
    ),
    schema: await call("get", { ref: "schema" }),
    lastTime: overview.value.lastTime,
  };
}
try {
  const procedure = await call<{ procedure: string }>("skill", {
    name: "frame talk",
  });
  assert(procedure.procedure.includes("One question at a time"));
  assert(procedure.procedure.includes("never outcomes"));
  console.log("PASS frame-talk loads through MCP with standing rules");
  const beforeStory = await story();
  const previous = (await call<{ value: Frame }>("get", { ref: "frame" }))
    .value;
  const initial = {
    goal: "Restore passage",
    stakes: "The ferry village is cut off",
    timeframe: "Before dusk",
    pressure: "The closing gate",
    finale: "A cracked gate above the ferry",
    moves_main_plot: "Reveal the broken seal",
    pulls_in: "Sera's ferry",
    next_session_starts: "At the ferry landing",
  };
  await call("frame_update", {
    reason: "My intent for the causeway",
    fields: initial,
  });
  await call("frame_update", {
    reason: "The gate now closes sooner",
    fields: { timeframe: "Before the third bell" },
  });
  const frame = (await call<{ value: Frame }>("get", { ref: "frame" })).value;
  assert.deepEqual(frame.fields, {
    ...initial,
    timeframe: "Before the third bell",
  });
  assert.equal(frame.history.length, previous.history.length + 2);
  assert.deepEqual(frame.history.at(-2)?.before, previous.fields);
  assert.deepEqual(frame.history.at(-2)?.after, initial);
  assert.equal(frame.history.at(-1)?.reason, "The gate now closes sooner");
  assert.equal(frame.history.at(-1)?.kind, "frame");
  assert.deepEqual(frame.history.at(-1)?.before, initial);
  assert.deepEqual(frame.history.at(-1)?.after, frame.fields);
  console.log(
    "PASS all eight fields stored, partial edit preserves the other seven, before/after history and reason retained",
  );
  const overview = (await call<{ value: Overview }>("get", { ref: "overview" }))
    .value;
  assert.equal(overview.frame.adventure, overview.currentAdventure);
  assert.deepEqual(overview.frame.fields, frame.fields);
  assert.deepEqual(await story(), beforeStory);
  console.log(
    "PASS get frame and overview agree; entities, relationships, entity history, sessions, schema and lastTime unchanged",
  );
  console.log("FRAME SDK E2E PASSED");
} finally {
  await client.close();
}
