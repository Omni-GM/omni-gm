import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const proof = "proof/reference-sessions";
const privateState = `.convex/references-${new URL(url).hostname}.json`;
const client = new Client({ name: "omni-gm-reference-proof", version: "1" });
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
async function get<T>(ref: string): Promise<T> {
  return (await call<{ value: T }>("get", { ref })).value;
}
async function upload(session: string, transcript: string) {
  const { url } = await call<{ url: string }>("transcript_upload_url", {
    session,
  });
  assert.equal(
    (await fetch(url, { method: "PUT", body: transcript })).status,
    200,
  );
}
type Session = {
  id: string;
  status: string;
  playedOn: string;
  ordinal: number;
  scenes: unknown[];
};
type Overview = {
  sessions: Session[];
  latestSession: Session | null;
  lastTime: string;
  commits: unknown[];
};
async function snapshot() {
  const overview = await get<Overview>("overview");
  const entities = await call<{ hits: { ref: string }[]; truncated: boolean }>(
    "find",
    { types: ["entity"], limit: 200 },
  );
  assert(!entities.truncated);
  return {
    overview,
    entities: await Promise.all(entities.hits.map((hit) => get(hit.ref))),
  };
}
try {
  if (process.argv.includes("--base")) {
    await call("adventure_start", {
      name: "The Copper Ferry",
      reason: "Invented older-transcript proof",
    });
    const recent = await call<Session>("session_create", {
      playedOn: "2026-03-07",
    });
    await upload(
      recent.id,
      "[00:00:10] GM: The party camps at the copper ferry.\n[00:01:00] GM: The old ferry duty roster names Rook.\n",
    );
    await call("scenes_set", {
      session: recent.id,
      scenes: [
        {
          title: "The ferry camp",
          start: "00:00:10",
          place: "Copper ferry",
          summary: "The party camps and recalls the keeper's name.",
        },
      ],
    });
    const added = await call<{ rejected: unknown[] }>("debrief_add", {
      session: recent.id,
      lastTime:
        "The party camps at the copper ferry [00:00:10]. The old ferry duty roster names Rook [00:01:00]. Next: 1. Walk the strong start. 2. Check the frame.",
      changes: [
        {
          scene: 1,
          change: {
            op: "new",
            kind: "place",
            name: "Copper ferry",
            properties: { detailsShown: "The party's camp" },
          },
          basis: ["narrated"],
          sources: [
            { quote: "The party camps at the copper ferry.", at: "00:00:10" },
          ],
          why: "Keep the camp",
        },
        {
          scene: 1,
          change: {
            op: "new",
            kind: "npc",
            name: "Rook",
            properties: { role: "Old ferry keeper" },
          },
          basis: ["narrated"],
          sources: [
            { quote: "The old ferry duty roster names Rook.", at: "00:01:00" },
          ],
          why: "Keep the keeper's name",
        },
      ],
    });
    assert.deepEqual(added.rejected, []);
    await call("debrief_commit", { session: recent.id });
    await call("frame_update", {
      reason: "Invented prep frame",
      fields: {
        goal: "Cross the river",
        stakes: "The party needs the ferry",
        timeframe: "Tonight",
        next_session_starts: "At the camp",
      },
    });
    await mkdir(".convex", { recursive: true });
    await writeFile(privateState, JSON.stringify({ recent: recent.id }));
    console.log(
      "PASS populated the base-schema preview with a transcript, scenes, two committed entities and a stored briefing",
    );
  } else if (process.argv.includes("--reference")) {
    const { recent } = JSON.parse(await readFile(privateState, "utf8")) as {
      recent: string;
    };
    const before = await get<Overview>("overview");
    assert.equal(before.latestSession?.id, recent);
    const older = await call<Session>("session_create", {
      playedOn: "2026-01-03",
      reference: true,
    });
    assert.equal(older.status, "reference");
    await upload(
      older.id,
      "[00:00:10] GM: Rook tends the copper ferry.\n[00:04:00] GM: Rook dies when the ferry chain snaps. You bury him beside the landing.\n[00:05:00] Tamsin: We should find a new keeper.\n",
    );
    const after = await get<Overview>("overview");
    assert.deepEqual(
      after.sessions.map((s) => s.id),
      [recent, older.id],
    );
    assert.deepEqual(after.latestSession, before.latestSession);
    assert.equal(after.lastTime, before.lastTime);
    assert.deepEqual(after.commits, before.commits);
    for (const [name, args] of [
      [
        "scenes_set",
        {
          scenes: [
            {
              title: "Death",
              start: "00:04:00",
              place: "Landing",
              summary: "Rook dies",
            },
          ],
        },
      ],
      ["debrief_add", { changes: [], lastTime: "Must not store" }],
      ["debrief_drop", { changeIds: [] }],
      ["debrief_commit", {}],
    ] as const) {
      const result = await client.callTool({
        name,
        arguments: { session: older.id, ...args },
      });
      assert(result.isError, `${name} must refuse a reference session`);
    }
    const hits = await call<{
      hits: {
        ref: string;
        title: string;
        session: { id: string; ordinal: number; playedOn: string };
      }[];
    }>("find", { query: "Rook dies", types: ["transcript"], limit: 200 });
    const death = hits.hits.find((hit) => hit.ref.endsWith("@00:04:00"));
    assert(death);
    assert.deepEqual(death.session, {
      id: older.id,
      ordinal: 2,
      playedOn: "2026-01-03",
    });
    assert.equal(death.title, "S2 2026-01-03 00:04:00 GM");
    console.log(
      "PASS additive schema deployed over existing sessions; older reference uploaded, sorted by played date, latest session and briefing unchanged; all scene and debrief writes refused; search labels S2 and played date",
    );
    await writeFile(
      `${proof}/before.json`,
      `${JSON.stringify(await snapshot(), null, 2)}\n`,
    );
  } else if (process.argv.includes("--verify")) {
    const events = (await readFile(`${proof}/claude.jsonl`, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const calls: { name: string; input: Record<string, unknown> }[] = [];
    let reply = "";
    for (const event of events) {
      if (event.type === "assistant") {
        assert.equal(event.message.model, "claude-opus-5-5");
        for (const block of event.message.content) {
          if (block.type === "tool_use") {
            calls.push({ name: block.name, input: block.input });
            reply = "";
          }
          if (block.type === "text")
            reply += `${reply ? "\n" : ""}${block.text}`;
        }
      }
    }
    assert.equal(events.at(-1).subtype, "success");
    assert(
      calls.some(
        (c) => c.name.endsWith("__skill") && c.input.name === "prep-sparring",
      ),
    );
    assert(
      calls.every((c) =>
        ["skill", "get", "find"].some((name) => c.name.endsWith(`__${name}`)),
      ),
      "The lookup writes no story state, scenes or debrief",
    );
    const before = JSON.parse(await readFile(`${proof}/before.json`, "utf8"));
    const lookup = calls.findIndex(
      (c) =>
        c.name.endsWith("__find") &&
        Array.isArray(c.input.types) &&
        c.input.types.includes("transcript"),
    );
    assert(lookup >= 0, "The client searched transcript utterances on demand");
    assert(
      calls
        .slice(0, lookup)
        .some(
          (c) =>
            c.name.endsWith("__get") &&
            JSON.stringify(c.input).includes(
              `entity:${before.entities.find((e: { name: string }) => e.name === "Rook").id}`,
            ),
        ),
      "Committed story state checked before older transcripts",
    );
    const older = before.overview.sessions.find(
      (s: Session) => s.status === "reference",
    ) as Session;
    assert(
      calls.some(
        (c) =>
          c.name.endsWith("__get") &&
          JSON.stringify(c.input).includes(`transcript:${older.id}@00:04:00`),
      ),
      "Relevant timestamp window read",
    );
    const lines = reply
      .split("\n")
      .filter((line) => /Rook/i.test(line) && /S2\s+00:04:00/.test(line));
    assert.equal(
      lines.length,
      1,
      "One contradiction line cites the older source",
    );
    assert.match(
      lines[0],
      /alive/i,
      "The game master's current slip is quoted",
    );
    assert.match(
      lines[0],
      /\bGM\b|game master|you said|your (?:words|claim|propos|start)/i,
      "The current source is named",
    );
    assert.match(
      lines[0],
      /di(?:es|ed)|dead|bur(?:y|ied)/i,
      "The older narration settles Rook's fate",
    );
    await writeFile(`${proof}/contradiction.md`, `${lines[0]}\n`);
    assert.deepEqual(await snapshot(), before);
    console.log(
      "PASS Opus loaded the section walk, checked entity history before searching older utterances, read the death's timestamp window, and flagged the slip in one line with both sources",
    );
    console.log(lines[0]);
    console.log(
      "PASS fresh MCP readback: story state, session records, commits, frame and briefing unchanged",
    );
    console.log("HEADLESS OLDER-TRANSCRIPT CONTRADICTION PASSED");
  } else throw new Error("Use --base, --reference or --verify");
} finally {
  await client.close();
}
