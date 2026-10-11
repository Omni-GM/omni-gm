import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "omni-gm-frame-readback", version: "1" });
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
async function story(): Promise<unknown> {
  const found = await call<{ hits: { ref: string }[] }>("find", {
    types: ["entity"],
    limit: 200,
  });
  const overview = await call<{
    value: { lastTime: string; sessions: { id: string }[] };
  }>("get", { ref: "overview" });
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
      "proof/frame-talk/claude-story-before.json",
      `${JSON.stringify(await story(), null, 2)}\n`,
    );
    console.log("PASS captured invented fixture story state before frame talk");
  } else {
    const events = (await readFile("proof/frame-talk/claude.jsonl", "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Event);
    for (const event of events)
      if (event.type === "user") {
        assert(
          !JSON.stringify(event.message).includes("Stop hook feedback"),
          "Headless proof must not contain operator hook feedback",
        );
        assert(
          !JSON.stringify(event.message).includes("system-reminder"),
          "Headless proof must not contain operator reminders",
        );
      }
    const calls: { name: string; input: Record<string, unknown> }[] = [];
    const texts: string[] = [];
    for (const event of events)
      if (event.type === "assistant") {
        assert.equal(event.message?.model, "claude-sonnet-5-5");
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
    const loaded = calls.findIndex(
      (c) =>
        c.name.endsWith("__skill") &&
        String(c.input.name).toLowerCase().replace(/[ _]+/g, "-") ===
          "frame-talk",
    );
    const writes = calls
      .map((c, index) => ({ ...c, index }))
      .filter((c) => c.name.endsWith("__frame_update"));
    assert(
      loaded >= 0 &&
        writes.length >= 1 &&
        writes.every((c) => c.index > loaded),
    );
    const reads = calls.slice(0, writes[0].index);
    const refsRead = reads
      .filter((c) => c.name.endsWith("__get"))
      .flatMap((c) => [
        c.input.ref,
        ...(Array.isArray(c.input.refs) ? c.input.refs : []),
      ]);
    assert(refsRead.includes("overview"));
    assert(refsRead.includes("frame"));
    assert(
      calls.every((c) =>
        ["skill", "get", "find", "frame_update"].some((name) =>
          c.name.endsWith(`__${name}`),
        ),
      ),
    );
    console.log(
      "PASS loaded frame-talk before writing, read the frame and latest debrief, used only frame writes",
    );
    assert(texts.length > 0);
    assert(
      texts.every((text) => !text.includes("?")),
      "All answers and satisfaction were supplied up front; no further questions are needed",
    );
    console.log(
      "PASS assistant asked zero questions with all answers supplied; no outcome questions in the transcript",
    );
    const frame = (
      await call<{
        value: {
          fields: Record<string, string>;
          history: {
            reason: string;
            before: Record<string, string>;
            after: Record<string, string>;
          }[];
        };
      }>("get", { ref: "frame" })
    ).value;
    const expected = {
      goal: "Restore passage through the Glass Causeway",
      stakes:
        "The ferry village is cut off if passage stays closed; restoring it keeps the village supplied",
      timeframe: "Before the gate closes at the fourth bell",
    };
    assert.deepEqual(frame.fields, expected);
    assert.equal(frame.history.length, 1);
    assert.deepEqual(frame.history[0].before, {});
    assert.deepEqual(frame.history[0].after, expected);
    assert.equal(
      frame.history[0].reason,
      "This is my intent for the causeway adventure",
    );
    const overview = await call<{
      value: { frame: { fields: Record<string, string> } };
    }>("get", { ref: "overview" });
    assert.deepEqual(overview.value.frame.fields, expected);
    assert.deepEqual(
      await story(),
      JSON.parse(
        await readFile("proof/frame-talk/claude-story-before.json", "utf8"),
      ),
    );
    console.log(
      "PASS game master's exact goal, stakes, timeframe and reason read back; one frame commit; story state unchanged",
    );
    console.log("HEADLESS FRAME TALK PROOF PASSED");
  }
} finally {
  await client.close();
}
