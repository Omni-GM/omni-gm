import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Entity, History, StoryChange } from "../convex/model";

const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "omni-gm-prep-proof", version: "1" });
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
async function reject(
  args: Record<string, unknown>,
  message: string,
): Promise<void> {
  const result = (await client.callTool({
    name: "story_commit",
    arguments: args,
  })) as CallToolResult;
  assert(
    result.isError && JSON.stringify(result.content).includes(message),
    `Expected ${message}`,
  );
}
function narrated(
  change: StoryChange["change"],
  quote: string,
  at: string,
): StoryChange {
  return {
    change,
    basis: ["narrated"],
    sources: [{ quote, at }],
    why: "Remember the invented session for prep",
  };
}
type StoredEntity = Entity & { history: History[]; relationships: unknown[] };
try {
  await call("adventure_start", {
    name: "The Amber Ferry",
    reason: "Invented sparring proof",
  });
  const session = await call<{ id: string }>("session_create", {
    playedOn: "2026-01-03",
  });
  const upload = await call<{ url: string }>("transcript_upload_url", {
    session: session.id,
  });
  const bytes = await readFile(
    new URL("../fixtures/prep-session.txt", import.meta.url),
  );
  assert.equal(
    (await fetch(upload.url, { method: "PUT", body: bytes })).status,
    200,
  );
  await call("scenes_set", {
    session: session.id,
    scenes: [
      {
        title: "The missing seal",
        start: "00:00:00",
        place: "Amber Landing",
        summary:
          "Mira claims the seal opens the ferry. A player guesses where it went. The bell clock is visible.",
      },
    ],
  });
  const changes: StoryChange[] = [
    narrated(
      {
        op: "new",
        tempKey: "mira",
        kind: "npc",
        name: "Mira",
        aliases: ["The keeper"],
        properties: { playedAs: "Short, quiet phrases", status: "alive" },
      },
      "Mira speaks in short, quiet phrases.",
      "00:01:00",
    ),
    narrated(
      {
        op: "new",
        tempKey: "landing",
        kind: "place",
        name: "Amber Landing",
        properties: {
          detailsShown:
            "Rain taps the brass roof. Wet rope smells of river mud. Green light shivers on the water.",
        },
      },
      "At Amber Landing, rain taps the brass roof. Wet rope smells of river mud. Green light shivers on the water.",
      "00:00:00",
    ),
    narrated(
      {
        op: "new",
        kind: "place",
        name: "Empty Loft",
        properties: { state: "open" },
      },
      "The Empty Loft is open.",
      "00:03:00",
    ),
    {
      change: {
        op: "new",
        kind: "world_fact",
        name: "The seal's use",
        properties: { statement: "Mira claims the seal opens the ferry" },
      },
      basis: ["npc_said"],
      sources: [
        {
          quote:
            "The seal opens the ferry. I have not seen it since the third bell.",
          at: "00:01:00",
        },
      ],
      why: "Keep Mira's claim distinct from narration",
    },
    {
      change: {
        op: "new",
        kind: "thread",
        name: "Where is the seal?",
        properties: {
          whatIsOpen: "Rowan guesses Mira hid it in the Empty Loft",
          status: "open",
        },
      },
      basis: ["player_guess"],
      sources: [
        {
          quote: "I think Mira hid the seal in the Empty Loft.",
          at: "00:02:00",
        },
      ],
      why: "Keep Rowan's guess on a thread",
    },
    narrated(
      {
        op: "new",
        kind: "clock",
        name: "Ferry bell",
        properties: {
          countsToward: "The ferry stops",
          segments: 4,
          filled: 1,
          visibleToPlayers: "shown",
        },
      },
      "The ferry bell clock has four segments, one filled, visible to all.",
      "00:03:00",
    ),
    narrated(
      { op: "relate", type: "last_seen_at", from: "$mira", to: "$landing" },
      "Mira is still at Amber Landing.",
      "00:03:00",
    ),
  ];
  const added = await call<{ rejected: unknown[] }>("debrief_add", {
    session: session.id,
    changes: changes.map((c) => ({ scene: 1, ...c })),
    lastTime:
      "At Amber Landing. The seal is missing. Ferry bell: 1/4, visible. Rowan's guess remains open.",
  });
  assert.deepEqual(added.rejected, []);
  await call("debrief_commit", { session: session.id });
  await call("frame_update", {
    reason: "My intent for the ferry",
    fields: {
      goal: "Return the seal",
      stakes: "The ferry stops without it",
      timeframe: "Before the fourth bell",
      moves_main_plot: "Learn why the keeper protects the seal",
    },
  });
  const hits = (
    await call<{ hits: { ref: string }[] }>("find", {
      query: "Mira",
      types: ["entity"],
      kinds: ["npc"],
      limit: 200,
    })
  ).hits;
  let mira: StoredEntity | undefined;
  for (const hit of hits) {
    const candidate = (
      await call<{ value: StoredEntity }>("get", { ref: hit.ref })
    ).value;
    if (candidate.history.some((h) => h.session === session.id))
      mira = candidate;
  }
  assert(mira, "Find the NPC from this proof session");
  await mkdir(".convex", { recursive: true });
  await writeFile(
    `.convex/prep-${new URL(url).hostname}.json`,
    JSON.stringify({ session: session.id, mira: mira.id }),
  );
  console.log(
    "PASS seeded a committed invented debrief, frame, source claims, a player guess, a visible clock and two places",
  );
  if (process.argv.includes("--seed-only")) {
    console.log("PREP FIXTURE READY");
  } else {
    for (const name of ["prep sparring", "plank questions"]) {
      const skill = await call<{ procedure: string }>("skill", { name });
      assert(skill.procedure.includes("Never draft prep"));
    }
    const before = await call("get", { ref: "overview" });
    const draft = await call("get", { ref: `debrief:${session.id}` });
    const update = {
      change: {
        op: "update",
        entity: mira.id,
        properties: { wants: "The seal returned before the fourth bell" },
      },
      basis: ["game_master"],
      sources: [
        { quote: "Mira wants the seal returned before the fourth bell." },
      ],
      why: "Record my plank answer about the keeper",
    };
    await reject(
      {
        reason: "Bad batch",
        changes: [
          update,
          {
            ...update,
            change: {
              op: "update",
              entity: mira.id,
              properties: { status: "invisible" },
            },
          },
        ],
      },
      "alive, dead, gone, unknown",
    );
    assert.deepEqual(await call("get", { ref: `entity:${mira.id}` }), {
      value: mira,
    });
    assert.deepEqual(await call("get", { ref: "overview" }), before);
    await reject(
      {
        reason: "A guess cannot change Mira",
        changes: [{ ...update, basis: ["player_guess"] }],
      },
      "only thread or character_goal",
    );
    console.log(
      "PASS invalid later change rolls back the entire batch and guess-only NPC correction is rejected",
    );
    const committed = await call<{ commit: string }>("story_commit", {
      reason: "Fill the keeper's main-plot background",
      changes: [update],
    });
    const saved = (
      await call<{ value: StoredEntity }>("get", { ref: `entity:${mira.id}` })
    ).value;
    assert.equal(
      saved.properties.wants,
      "The seal returned before the fourth bell",
    );
    assert.deepEqual(saved.history.at(-1)?.basis, ["game_master"]);
    assert.deepEqual(saved.history.at(-1)?.sources, update.sources);
    assert.equal(saved.history.at(-1)?.commit, committed.commit);
    assert(!Object.hasOwn(saved.history.at(-1) ?? {}, "session"));
    assert.deepEqual(
      await call("get", { ref: `debrief:${session.id}` }),
      draft,
    );
    console.log(
      "PASS plank answer stored with exact words, game_master basis and history; committed debrief unchanged",
    );
    const source = await call<{
      hits: { basis?: string[]; score?: number; ref: string }[];
    }>("find", { query: "seal", types: ["source"], limit: 200 });
    assert(source.hits.some((h) => h.basis?.includes("npc_said")));
    assert(source.hits.some((h) => h.basis?.includes("player_guess")));
    assert(source.hits.some((h) => h.basis?.includes("game_master")));
    assert(
      source.hits.every(
        (h, i) => i === 0 || (source.hits[i - 1].score ?? 0) >= (h.score ?? 0),
      ),
    );
    const relevant = await call<{
      hits: { basis?: string[]; snippet?: string }[];
    }>("find", { query: "seal returned", types: ["source"], limit: 200 });
    assert(relevant.hits[0].basis?.includes("game_master"));
    assert(relevant.hits[0].snippet?.includes("Mira wants the seal returned"));
    console.log(
      "PASS the known two-keyword GM answer ranks ahead of single-keyword claims within the page",
    );
    const utterances = await call<{ hits: { ref: string; title: string }[] }>(
      "find",
      { query: "seal", types: ["transcript"], limit: 200 },
    );
    const hit = utterances.hits.find((h) =>
      h.ref.startsWith(`transcript:${session.id}@`),
    );
    assert(hit);
    const context = await call<{
      value: { utterances: { speaker: string; text: string }[] };
    }>("get", { ref: hit.ref });
    assert(context.value.utterances.some((u) => u.text.includes("seal")));
    console.log(
      "PASS source search ranks and preserves NPC claims, player guesses and GM answers; utterance refs read timestamp context",
    );
    console.log("PREP SDK E2E PASSED");
  }
} finally {
  await client.close();
}
