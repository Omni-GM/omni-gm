import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

function object(value: unknown): Record<string, unknown> {
  assert(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function sanitize(value: unknown): unknown {
  if (typeof value === "string")
    return value.replace(/(\/upload\?token=)[^\s"'\\<>]+/g, "$1[REDACTED]");
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitize(item)]),
    );
  return value;
}

const mode = process.argv[2];
const rawPath = process.argv[3];
const publicPath = process.argv[4];
assert(
  (mode === "no-shell" || mode === "shell") && rawPath && publicPath,
  "Usage: tsx scripts/verify-agent-upload.ts no-shell|shell raw.jsonl public.jsonl",
);
const events = (await readFile(rawPath, "utf8"))
  .trim()
  .split("\n")
  .map((line) => object(JSON.parse(line)));
const init = events.find(
  (event) => event.type === "system" && event.subtype === "init",
);
assert(init && Array.isArray(init.tools));
assert.equal(init.model, "claude-sonnet-5-5");
const result = events.at(-1);
assert(result && result.type === "result" && result.subtype === "success");
const outputTokens = object(result.usage).output_tokens;
assert(typeof outputTokens === "number" && outputTokens > 0);
const calls: { name: string; input: Record<string, unknown> }[] = [];
const assistantText: string[] = [];
const publication: unknown[] = [
  {
    type: "proof",
    model: init.model,
    command:
      mode === "no-shell"
        ? "claude -p --model claude-sonnet-5-5 --tools '' --disallowedTools Bash"
        : "claude -p --model claude-sonnet-5-5 --tools Bash",
    tools: init.tools,
    mcp_servers: init.mcp_servers,
    note: "Invented fixture. Upload capabilities and provider usage removed except the requested output-token total.",
  },
];
for (const event of events) {
  if (event.type === "assistant") {
    const message = object(event.message);
    assert.equal(message.model, "claude-sonnet-5-5");
    assert(Array.isArray(message.content));
    for (const item of message.content) {
      const block = object(item);
      if (block.type === "tool_use") {
        assert(typeof block.name === "string");
        calls.push({ name: block.name, input: object(block.input) });
      }
      if (block.type === "text") {
        assert(typeof block.text === "string");
        assistantText.push(block.text);
      }
    }
    publication.push({
      type: "assistant",
      message: {
        model: message.model,
        content: message.content.filter((item) =>
          ["tool_use", "text"].includes(String(object(item).type)),
        ),
      },
    });
  }
  if (event.type === "user")
    publication.push({ type: "user", message: event.message });
}
const skill = calls.findIndex(
  (c) => c.name.endsWith("__skill") && c.input.name === "split-scenes",
);
const firstWrite = calls.findIndex((c) =>
  [
    "adventure_start",
    "session_create",
    "transcript_upload_url",
    "transcript_append",
    "scenes_set",
  ].some((name) => c.name.endsWith(`__${name}`)),
);
assert(skill >= 0 && firstWrite > skill, "Load split-scenes before writing");
assert(
  calls.some(
    (c) => c.name.endsWith("__skill") && c.input.name === "map-speakers",
  ),
);
const split = calls.find((c) => c.name.endsWith("__scenes_set"));
assert(split && typeof split.input.session === "string");
const fixture = await readFile(
  new URL("../fixtures/session.txt", import.meta.url),
  "utf8",
);
const appends = calls.filter((c) => c.name.endsWith("__transcript_append"));
if (mode === "no-shell") {
  assert(!init.tools.includes("Bash"));
  assert(
    calls.every((c) => c.name.startsWith("mcp__omni-gm__")),
    "No local tools or human question",
  );
  assert(
    appends.length > 0 &&
      appends.every((c) => c.input.session === split.input.session),
  );
  const chunks = new Map<number, string>();
  for (const call of appends) {
    assert(
      typeof call.input.index === "number" &&
        typeof call.input.chunk === "string",
    );
    if (chunks.has(call.input.index))
      assert.equal(chunks.get(call.input.index), call.input.chunk);
    chunks.set(call.input.index, call.input.chunk);
  }
  assert.equal(
    [...chunks.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, text]) => text)
      .join(""),
    fixture,
  );
  assert(appends.some((c) => c.input.final === true));
  assert(!calls.some((c) => c.name.endsWith("__transcript_upload_url")));
  console.log(
    "PASS Bash absent; agent loaded split-scenes and map-speakers, uploaded exact fixture through transcript_append, and stored scenes without a human step",
  );
} else {
  assert(init.tools.includes("Bash"));
  assert.equal(appends.length, 0);
  assert(calls.some((c) => c.name.endsWith("__transcript_upload_url")));
  assert(
    calls.some(
      (c) =>
        c.name === "Bash" &&
        typeof c.input.command === "string" &&
        /curl\b[\s\S]*(\s-[a-zA-Z]*T\b|--upload-file\b)/.test(c.input.command),
    ),
  );
  for (const call of calls)
    for (const line of fixture.trim().split("\n"))
      assert(
        !JSON.stringify(call.input).includes(line),
        "No transcript line in shell agent tool arguments",
      );
  console.log(
    "PASS shell agent used signed URL and curl -T from disk, with no transcript in tool arguments",
  );
}
for (const text of assistantText)
  for (const line of fixture.trim().split("\n"))
    assert(!text.includes(line), "No transcript line in chat output");
console.log("PASS agent did not echo transcript in chat");

const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({
  name: "omni-gm-agent-independent-readback",
  version: "1",
});
await client.connect(
  new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
async function get<T>(ref: string): Promise<T> {
  const response = (await client.callTool({
    name: "get",
    arguments: { ref },
  })) as CallToolResult;
  assert(!response.isError && response.structuredContent, `${ref} failed`);
  return response.structuredContent.value as T;
}
try {
  const transcript = await get<{
    downloadUrl: string;
    utterances: unknown[];
    truncated: boolean;
  }>(`transcript:${split.input.session}`);
  assert.equal(transcript.truncated, false);
  assert.equal(transcript.utterances.length, 7);
  const response = await fetch(transcript.downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    Buffer.from(fixture),
  );
  const session = await get<{ scenes: unknown[] }>(
    `session:${split.input.session}`,
  );
  assert(session.scenes.length > 0);
  assert.deepEqual(session.scenes, split.input.scenes);
  console.log(
    "PASS independent authenticated SDK readback confirms every fixture byte, seven utterances and the agent's saved scenes",
  );
} finally {
  await client.close();
}
publication.push({
  type: "result",
  subtype: result.subtype,
  output_tokens: outputTokens,
  num_turns: result.num_turns,
  result: result.result,
});
await writeFile(
  publicPath,
  `${publication.map((item) => JSON.stringify(sanitize(item))).join("\n")}\n`,
);
console.log(`OUTPUT TOKENS ${outputTokens}`);
console.log(`PROOF SESSION ${split.input.session}`);
console.log(`${mode.toUpperCase()} HEADLESS UPLOAD PROOF PASSED`);
