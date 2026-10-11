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
const [mode, rawPath, publicPath, promptPath] = process.argv.slice(2);
assert(
  ["no-shell", "shell", "resume"].includes(mode) &&
    rawPath &&
    publicPath &&
    promptPath,
  "Usage: tsx scripts/verify-agent-upload.ts no-shell|shell|resume raw.jsonl public.jsonl prompt.txt",
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
assert.equal(events.at(-1)?.subtype, "success");
const calls: { name: string; input: Record<string, unknown> }[] = [];
const texts: string[] = [];
const publication: unknown[] = [
  {
    type: "proof",
    model: init.model,
    tools: init.tools,
    command:
      mode === "shell"
        ? "claude -p --model claude-sonnet-5-5 --tools Bash"
        : "claude -p --model claude-sonnet-5-5 --tools '' --disallowedTools Bash",
    prompt: await readFile(promptPath, "utf8"),
    note: "Invented fixture. Upload capabilities, provider usage and thinking omitted. Hooks disabled for this run.",
  },
];
for (const event of events) {
  if (event.type === "assistant") {
    const message = object(event.message);
    assert(Array.isArray(message.content));
    for (const item of message.content) {
      const block = object(item);
      if (block.type === "tool_use") {
        assert(typeof block.name === "string");
        calls.push({ name: block.name, input: object(block.input) });
      }
      if (block.type === "text") {
        assert(typeof block.text === "string");
        texts.push(block.text);
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
const fixture = await readFile(
  new URL("../fixtures/session.txt", import.meta.url),
  "utf8",
);
for (const text of [
  ...texts,
  ...calls.map((call) => JSON.stringify(call.input)),
])
  for (const line of fixture.trim().split("\n"))
    assert(
      !text.includes(line),
      "No transcript line in chat or tool arguments",
    );
assert(!calls.some((call) => call.name.endsWith("__transcript_append")));
const procedure = calls.findIndex(
  (call) => call.name.endsWith("__skill") && call.input.name === "split-scenes",
);
assert(procedure >= 0);
const firstWrite = calls.findIndex((call) =>
  [
    "adventure_start",
    "session_create",
    "transcript_upload_url",
    "scenes_set",
  ].some((name) => call.name.endsWith(`__${name}`)),
);
assert(
  firstWrite < 0 || firstWrite > procedure,
  "Load procedure before writing",
);
const upload = calls.find((call) =>
  call.name.endsWith("__transcript_upload_url"),
);
const split = calls.find((call) => call.name.endsWith("__scenes_set"));
let session: string;
if (mode === "no-shell") {
  assert(!init.tools.includes("Bash"));
  assert(calls.every((call) => call.name.startsWith("mcp__omni-gm__")));
  assert(upload && typeof upload.input.session === "string");
  session = upload.input.session;
  assert(
    !split &&
      !calls.some(
        (call) =>
          call.name.endsWith("__debrief_add") ||
          call.name.endsWith("__debrief_commit"),
      ),
    "Wait for upload before processing",
  );
  assert(texts.some((text) => text.includes("/upload-page?session=")));
  console.log(
    "PASS no-shell agent immediately gives pageUrl, does not retype the transcript, and waits without scenes or debrief writes",
  );
} else {
  assert(split && typeof split.input.session === "string");
  session = split.input.session;
  const confirmation = calls.findIndex(
    (call) =>
      call.name.endsWith("__get") && call.input.ref === `transcript:${session}`,
  );
  assert(
    confirmation >= 0 && confirmation < calls.indexOf(split),
    "Confirm stored transcript before scenes",
  );
  if (mode === "shell") {
    assert(init.tools.includes("Bash") && upload);
    assert(
      calls.some(
        (call) =>
          call.name === "Bash" &&
          typeof call.input.command === "string" &&
          /curl\b[\s\S]*(\s-[a-zA-Z]*T\b|--upload-file\b)/.test(
            call.input.command,
          ),
      ),
    );
    console.log(
      "PASS shell agent uses curl -T from disk and confirms the stored transcript before scenes",
    );
  } else {
    assert(!init.tools.includes("Bash"));
    console.log(
      "PASS resumed no-shell agent confirms the stored transcript before scenes",
    );
  }
}
const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token);
const client = new Client({
  name: "independent-upload-readback",
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
  assert(!response.isError && response.structuredContent);
  return response.structuredContent.value as T;
}
try {
  if (mode === "no-shell") {
    const missing = (await client.callTool({
      name: "get",
      arguments: { ref: `transcript:${session}` },
    })) as CallToolResult;
    assert(
      missing.isError &&
        JSON.stringify(missing.content).includes("Upload a transcript first"),
    );
    console.log(
      "PASS independent MCP readback confirms no transcript has been invented or stored",
    );
  } else {
    const transcript = await get<{
      downloadUrl: string;
      utterances: unknown[];
    }>(`transcript:${session}`);
    assert(transcript);
    assert.equal(transcript.utterances.length, 7);
    const response = await fetch(transcript.downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      Buffer.from(fixture),
    );
    const stored = await get<{ scenes: unknown[] }>(`session:${session}`);
    assert.deepEqual(stored.scenes, split?.input.scenes);
    console.log(
      "PASS independent MCP readback confirms exact fixture bytes and saved scenes",
    );
  }
} finally {
  await client.close();
}
publication.push({
  type: "result",
  subtype: "success",
  result: events.at(-1)?.result,
});
await writeFile(
  publicPath,
  `${publication.map((item) => JSON.stringify(sanitize(item))).join("\n")}\n`,
);
console.log(`PROOF SESSION ${session}`);
console.log(`${mode.toUpperCase()} HEADLESS UPLOAD PROOF PASSED`);
