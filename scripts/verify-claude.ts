import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

function object(value: unknown): Record<string, unknown> {
  assert(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
const events: Record<string, unknown>[] = (
  await readFile(process.env.OMNI_GM_CLAUDE_LOG ?? "proof/claude.jsonl", "utf8")
)
  .trim()
  .split("\n")
  .map((line) => object(JSON.parse(line)));
const calls: { name: string; input: Record<string, unknown> }[] = [];
const assistantText: string[] = [];
for (const event of events)
  if (event.type === "assistant") {
    const message = object(event.message);
    assert.equal(message.model, "claude-sonnet-5-5");
    assert(Array.isArray(message.content));
    for (const content of message.content) {
      const block = object(content);
      if (block.type === "tool_use") {
        assert.equal(typeof block.name, "string");
        calls.push({ name: block.name as string, input: object(block.input) });
      }
      if (block.type === "text") {
        assert.equal(typeof block.text, "string");
        assistantText.push(block.text as string);
      }
    }
  }
const procedure = calls.findIndex(
  (c) => c.name.endsWith("__skill") && c.input.name === "debrief",
);
const firstWrite = calls.findIndex((c) =>
  [
    "adventure_start",
    "session_create",
    "transcript_upload_url",
    "scenes_set",
    "debrief_add",
  ].some((name) => c.name.endsWith(`__${name}`)),
);
assert(procedure >= 0 && firstWrite > procedure);
assert.equal(events.at(-1)?.subtype, "success");
console.log(
  "PASS Claude Sonnet 5.5 loaded debrief before any write and completed",
);
const fixture = await readFile(
  new URL("../fixtures/session.txt", import.meta.url),
  "utf8",
);
for (const text of [
  ...assistantText,
  ...calls.map((call) => JSON.stringify(call.input)),
]) {
  assert(
    !text.includes(fixture.trim()),
    "Assistant echoed the full transcript",
  );
  for (const line of fixture.trim().split("\n"))
    assert(!text.includes(line), "Assistant echoed a transcript line");
}
console.log("PASS no transcript reproduction in assistant text or tool inputs");
const commit = calls.find((c) => c.name.endsWith("__debrief_commit"));
assert(commit && typeof commit.input.session === "string");
const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "omni-gm-claude-readback", version: "1" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
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
try {
  const draft = await call<{ value: { status: string; lastTime: string } }>(
    "get",
    { ref: `debrief:${commit.input.session}` },
  );
  assert.equal(draft.value.status, "committed");
  assert(draft.value.lastTime.length > 0);
  const found = await call<{ hits: { ref: string }[] }>("find", {
    query: "Sera Venn",
    types: ["entity"],
    kinds: ["npc"],
    limit: 200,
  });
  type Npc = {
    value: {
      properties: { playedAs: string };
      aliases: string[];
      history: { basis: string[]; session: string }[];
    };
  };
  const candidates = await Promise.all(
    found.hits.map((hit) => call<Npc>("get", { ref: hit.ref })),
  );
  const matching = candidates.filter((npc) =>
    npc.value.history.some((h) => h.session === commit.input.session),
  );
  assert.equal(matching.length, 1);
  const npc = matching[0];
  assert(npc.value.properties.playedAs.length > 0);
  assert(npc.value.aliases.includes("Sarah Ven"));
  for (const h of npc.value.history)
    assert(!h.basis.every((b) => b === "player_guess" || b === "player_plan"));
  console.log(
    "PASS committed lastTime, voiced NPC playedAs and spelling alias read back",
  );
  const npcs = await call<{ hits: { ref: string; title: string }[] }>("find", {
    types: ["entity"],
    kinds: ["npc"],
  });
  assert(!npcs.hits.some((h) => h.title.includes("Lantern Widow")));
  for (const hit of npcs.hits) {
    const e = await call<{ value: { history: { basis: string[] }[] } }>("get", {
      ref: hit.ref,
    });
    for (const h of e.value.history)
      assert(
        !h.basis.every((b) => b === "player_guess" || b === "player_plan"),
      );
  }
  const threads = await call<{ hits: { ref: string }[] }>("find", {
    types: ["entity"],
    kinds: ["thread"],
  });
  let hasGuess = false;
  for (const hit of threads.hits) {
    const e = await call<{ value: { history: { basis: string[] }[] } }>("get", {
      ref: hit.ref,
    });
    hasGuess ||= e.value.history.some((h) =>
      h.basis.every((b) => b === "player_guess" || b === "player_plan"),
    );
  }
  assert(hasGuess);
  console.log(
    "PASS player guess is a thread and touches no NPC; rumor figure is no NPC",
  );
  console.log("CLAUDE FIXTURE PROOF PASSED");
} finally {
  await client.close();
}
