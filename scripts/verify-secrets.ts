import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Secret } from "../convex/model";

const proof = process.env.OMNI_GM_PROOF_DIR ?? "proof/secrets";
const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "omni-gm-secret-readback", version: "1" });
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
  const overview = (
    await call<{ value: { sessions: { id: string }[]; lastTime: string } }>(
      "get",
      { ref: "overview" },
    )
  ).value;
  const found = await call<{ hits: { ref: string }[]; truncated: boolean }>(
    "find",
    { types: ["entity"], limit: 200 },
  );
  assert(!found.truncated, "Invented fixture fits one page");
  const entities = [];
  for (const hit of found.hits) {
    const entity = (
      await call<{ value: { truncated: boolean } }>("get", { ref: hit.ref })
    ).value;
    assert(!entity.truncated, "Invented entity history fits one page");
    entities.push(entity);
  }
  return {
    found,
    entities,
    frame: await call("get", { ref: "frame" }),
    schema: await call("get", { ref: "schema" }),
    lastTime: overview.lastTime,
    sessions: await Promise.all(
      overview.sessions.map((s) => call("get", { ref: `session:${s.id}` })),
    ),
  };
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
try {
  if (process.argv.includes("--before")) {
    await writeFile(
      `${proof}/story-before.json`,
      `${JSON.stringify(await snapshot(), null, 2)}\n`,
    );
    console.log(
      "PASS captured the committed invented story, full entity histories, frame, schema, sessions and lastTime before the plank run",
    );
  } else if (process.argv.includes("--upgrade")) {
    assert.deepEqual(
      await snapshot(),
      JSON.parse(await readFile(`${proof}/story-before.json`, "utf8")),
    );
    const overview = (
      await call<{ value: { openSecrets: number } }>("get", { ref: "overview" })
    ).value;
    assert.equal(overview.openSecrets, 0);
    const written = await call<{ secret: Secret }>("secret_write", {
      op: "write",
      text: "The weir has a second dry chamber.",
      reason: "Invented additive-schema upgrade proof",
    });
    assert.equal(written.secret.status, "hidden");
    assert.equal(
      (
        await call<{ value: { openSecrets: number } }>("get", {
          ref: "overview",
        })
      ).value.openSecrets,
      1,
    );
    assert.deepEqual(
      await snapshot(),
      JSON.parse(await readFile(`${proof}/story-before.json`, "utf8")),
    );
    console.log(
      "PASS additive schema deploy preserves a populated pre-secret campaign, all entities and histories, frame, schema, sessions and lastTime; first secret write initializes the count without changing story state",
    );
  } else {
    const events = (await readFile(`${proof}/claude.jsonl`, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Event);
    assert.equal(
      events.filter((e) => e.type === "result").length,
      4,
      "Four complete headless turns",
    );
    for (const event of events.filter((e) => e.type === "result"))
      assert.equal(event.subtype, "success");
    const calls = events
      .filter((e) => e.type === "assistant")
      .flatMap((e) =>
        (e.message?.content ?? [])
          .filter((b) => b.type === "tool_use")
          .map((b) => ({ ...b, turn: e.turn })),
      );
    const texts = (turn: number) =>
      events
        .filter((e) => e.type === "assistant" && e.turn === turn)
        .flatMap((e) =>
          (e.message?.content ?? [])
            .filter((b) => b.type === "text")
            .map((b) => b.text ?? ""),
        )
        .join("\n");
    assert(
      calls.some(
        (c) =>
          c.turn === 1 &&
          c.name?.endsWith("__skill") &&
          c.input?.name === "plank-questions",
      ),
      "Load plank-questions before the answer",
    );
    assert.equal((texts(1).match(/\?/g) ?? []).length, 1, "One plank question");
    const writes = calls.filter((c) => c.name?.endsWith("__secret_write"));
    assert.equal(writes.length, 1, "Exactly one secret write");
    assert.equal(writes[0].turn, 2);
    assert.equal(writes[0].input?.op, "write");
    assert(
      calls.every((c) =>
        ["skill", "get", "find", "secret_write"].some((name) =>
          c.name?.endsWith(`__${name}`),
        ),
      ),
      "The plank run and briefing perform no story or frame writes",
    );
    const expected =
      "Dace secretly shelters Pell and Nia in a dry chamber under the weir to protect them from Holloway.";
    const secrets: Secret[] = [];
    let cursor: string | null = null;
    do {
      const page: { secrets: Secret[]; nextCursor: string | null } = (
        await call<{ value: { secrets: Secret[]; nextCursor: string | null } }>(
          "get",
          { ref: "secrets", cursor },
        )
      ).value;
      secrets.push(...page.secrets);
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(secrets.length, 1);
    assert.equal(secrets[0].text, expected);
    assert.equal(secrets[0].status, "hidden");
    const secret = (
      await call<{
        value: {
          history: {
            op: string;
            reason: string;
            before: unknown;
            after: Secret;
          }[];
          truncated: boolean;
        };
      }>("get", { ref: secrets[0].id })
    ).value;
    assert(!secret.truncated);
    assert.equal(secret.history.length, 1);
    assert.equal(secret.history[0].op, "write");
    assert.equal(
      secret.history[0].reason,
      "I want the rescue to put pressure on Holloway",
    );
    assert.equal(secret.history[0].before, null);
    assert.deepEqual(secret.history[0].after, secrets[0]);
    console.log(
      "PASS the exact game-master answer is one hidden secret with its reason and before/after history",
    );
    assert.deepEqual(
      await snapshot(),
      JSON.parse(await readFile(`${proof}/story-before.json`, "utf8")),
    );
    console.log(
      "PASS story state and every entity history, frame, schema, session and lastTime remain unchanged",
    );
    const count = texts(3)
      .split(/\s+/)
      .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    assert(
      count >= 400 && count <= 600,
      `Briefing has ${count} words, expected 400 to 600`,
    );
    assert(
      !/fear(s|ed)? Holloway/i.test(texts(3)),
      "The secret does not establish that Dace fears Holloway",
    );
    console.log(
      `PASS next briefing has ${count} words and adds no unsupported fear for Dace`,
    );
    for (const turn of [3, 4]) {
      assert(
        calls.some(
          (c) =>
            c.turn === turn &&
            c.name?.endsWith("__get") &&
            (c.input?.ref === "secrets" ||
              (Array.isArray(c.input?.refs) &&
                c.input.refs.includes("secrets"))),
        ),
        `Turn ${turn} reads open secrets`,
      );
      const marked = texts(turn)
        .split("\n")
        .find(
          (line) =>
            /\(secret\)/i.test(line) &&
            /Dace/i.test(line) &&
            /Pell/i.test(line) &&
            /Nia/i.test(line),
        );
      assert(marked, `Turn ${turn} marks the relevant secret`);
      assert(
        marked.includes(expected),
        "The marked secret preserves the game master's exact text",
      );
      assert(
        marked.includes(secrets[0].id),
        "The secret source is the full, usable ref",
      );
      assert(
        /chamber|weir/i.test(marked),
        "The secret's location appears in the marked line",
      );
      console.log(
        `PASS ${turn === 3 ? "next briefing" : "section walk"} reads and marks the unplayed background: ${marked}`,
      );
      await writeFile(
        `${proof}/${turn === 3 ? "briefing" : "section-walk"}.md`,
        `${texts(turn)}\n`,
      );
    }
    const overview = (
      await call<{ value: { openSecrets: number } }>("get", { ref: "overview" })
    ).value;
    assert.equal(overview.openSecrets, 1);
    console.log("HEADLESS PLANK TO SECRET TO BRIEFING PROOF PASSED");
  }
} finally {
  await client.close();
}
