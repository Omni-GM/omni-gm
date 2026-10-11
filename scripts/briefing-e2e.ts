import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { StoryChange } from "../convex/model";

const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "omni-gm-briefing-seed", version: "1" });
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

type Basis = StoryChange["basis"][number];
type Scene = { scene: number } & StoryChange;

function said(
  scene: number,
  basis: Basis,
  change: StoryChange["change"],
  quote: string,
  at: string,
): Scene {
  return {
    scene,
    change,
    basis: [basis],
    sources: [{ quote, at }],
    why: "Remember the invented session for the briefing",
  };
}

const mill: Scene[] = [
  said(
    1,
    "narrated",
    {
      op: "new",
      tempKey: "mill",
      kind: "place",
      name: "The tallow mill",
      properties: {
        detailsShown:
          "The wheel turns slower than it should. The cellar smells of old tallow and wet stone.",
      },
    },
    "The tallow mill groans on the river, its wheel turning slower than it should.",
    "00:00:10",
  ),
  said(
    1,
    "narrated",
    {
      op: "new",
      tempKey: "ferrant",
      kind: "npc",
      name: "Widow Ferrant",
      properties: {
        role: "Owner of the tallow mill",
        playedAs: "Slow, clipped words; never sits down",
        wants: "Her two apprentices found",
        relationships: "Employs Corwin Ashe as foreman",
        status: "alive",
      },
    },
    "Widow Ferrant speaks in slow, clipped words and never sits down.",
    "00:01:55",
  ),
  said(
    1,
    "narrated",
    {
      op: "new",
      tempKey: "apprentices",
      kind: "thread",
      name: "The missing apprentices",
      properties: {
        whatIsOpen:
          "Pell and Nia vanished from the mill loft three nights ago; the window latch is scratched from outside",
        status: "open",
        nextStep: "Search the cellar",
      },
    },
    "Two of my apprentices are gone. Pell and Nia. Three nights now. Find them.",
    "00:01:30",
  ),
  said(
    1,
    "narrated",
    { op: "relate", type: "raised_by", from: "$apprentices", to: "$ferrant" },
    "Two of my apprentices are gone. Pell and Nia. Three nights now. Find them.",
    "00:01:30",
  ),
  said(
    1,
    "narrated",
    {
      op: "new",
      tempKey: "corwin",
      kind: "npc",
      name: "Corwin Ashe",
      properties: {
        role: "Foreman of the tallow mill",
        playedAs: "Nervous laugh; keeps rubbing flour from his hands",
        relationships: "Foreman for Widow Ferrant",
        status: "alive",
      },
    },
    "Corwin Ashe, the mill foreman, shows you the apprentices' loft. He laughs nervously and keeps rubbing flour from his hands.",
    "00:05:20",
  ),
  said(
    1,
    "narrated",
    { op: "relate", type: "last_seen_at", from: "$corwin", to: "$mill" },
    "Corwin Ashe, the mill foreman, shows you the apprentices' loft.",
    "00:05:20",
  ),
  said(
    1,
    "rumor",
    {
      op: "new",
      kind: "world_fact",
      name: "The haunted cellar",
      properties: {
        statement:
          "Town rumor says the mill cellar is haunted by the old miller who drowned there",
      },
    },
    "The cellar is haunted, everybody in town says so. The old miller drowned down there.",
    "00:09:15",
  ),
];

const hall: Scene[] = [
  said(
    2,
    "narrated",
    {
      op: "new",
      tempKey: "holloway",
      kind: "npc",
      name: "Reeve Holloway",
      properties: {
        role: "Town reeve of Hollin's Weir",
        playedAs: "Formal; quotes the town charter at every turn",
        wants: "The children found before the harvest fair",
        status: "alive",
      },
    },
    "Reeve Holloway receives you. He is formal and quotes the town charter at every turn.",
    "00:12:00",
  ),
  said(
    2,
    "npc_said",
    {
      op: "new",
      tempKey: "fair",
      kind: "clock",
      name: "Harvest fair",
      properties: {
        countsToward: "Reeve Holloway closes the mill",
        segments: 3,
        filled: 1,
        visibleToPlayers: "shown",
      },
    },
    "Reeve Holloway: If those children are not found by then, I close the mill.",
    "00:12:50",
  ),
  said(
    2,
    "narrated",
    { op: "relate", type: "pressures", from: "$fair", to: "$apprentices" },
    "The harvest fair clock has three segments; one is filled. You can all see it.",
    "00:13:40",
  ),
  said(
    2,
    "npc_said",
    {
      op: "new",
      kind: "world_fact",
      name: "The weir gate key",
      properties: {
        statement: "According to Reeve Holloway, Widow Ferrant keeps the key",
      },
    },
    "Reeve Holloway: The widow, of course. She will tell you otherwise.",
    "00:15:30",
  ),
];

const river: Scene[] = [
  said(
    3,
    "narrated",
    {
      op: "new",
      tempKey: "dace",
      kind: "npc",
      name: "Dace",
      properties: {
        role: "Barge smuggler",
        playedAs: "Grins, calls everyone cousin, never stops coiling rope",
        wants: "Nobody watching the weir at night",
        status: "alive",
      },
    },
    "Dace grins, calls everyone cousin, and never stops coiling rope.",
    "00:19:40",
  ),
  said(
    3,
    "narrated",
    {
      op: "new",
      tempKey: "barges",
      kind: "thread",
      name: "The night barges",
      properties: {
        whatIsOpen: "Two flat barges slip past the weir at night with lanterns",
        status: "open",
      },
    },
    "Lanterns move on the water: two flat barges slipping past the weir.",
    "00:18:00",
  ),
  said(
    3,
    "npc_said",
    {
      op: "new",
      tempKey: "debt",
      kind: "thread",
      name: "Corwin's debt",
      properties: {
        whatIsOpen: "Dace claims Corwin owes him money",
        status: "open",
      },
    },
    "Dace: Ask your foreman about the money he owes me. Corwin is my favorite debtor.",
    "00:20:30",
  ),
  said(
    3,
    "npc_said",
    { op: "relate", type: "raised_by", from: "$debt", to: "$dace" },
    "Dace: Ask your foreman about the money he owes me.",
    "00:20:30",
  ),
  said(
    3,
    "npc_said",
    {
      op: "new",
      kind: "npc",
      name: "Sister Ulla",
      properties: {
        role: "Hedge-healer who patched up Dace's boatmen, according to Dace",
        status: "unknown",
      },
    },
    "Dace: Sister Ulla patched up my boatmen last spring. She asks no questions.",
    "00:22:00",
  ),
  {
    scene: 3,
    change: {
      op: "update",
      entity: "$barges",
      properties: {
        nextStep: "The party plans to watch the weir tomorrow night",
      },
    },
    basis: ["player_guess", "player_plan"],
    sources: [
      {
        quote: "I think the barges carried the children downriver.",
        at: "00:23:10",
      },
      {
        quote:
          "Tomorrow we search the cellar, then we watch the weir at night.",
        at: "00:29:00",
      },
    ],
    why: "Keep Tamsin's guess and the party's plan on the thread",
  },
  said(
    3,
    "narrated",
    {
      op: "new",
      tempKey: "flood",
      kind: "clock",
      name: "Weir flood",
      properties: {
        countsToward: "The river floods the mill",
        segments: 4,
        filled: 2,
        visibleToPlayers: "hidden",
      },
    },
    "The water behind the weir rises. The weir flood clock stands at two of four. Only I know it.",
    "00:24:00",
  ),
  said(
    3,
    "narrated",
    { op: "relate", type: "pressures", from: "$flood", to: "$mill" },
    "The water behind the weir rises.",
    "00:24:00",
  ),
  said(
    3,
    "narrated",
    {
      op: "new",
      tempKey: "tamsin",
      kind: "player_character",
      name: "Tamsin",
      properties: { concept: "Sharp-eyed river guide" },
    },
    "The window latch is scratched from outside.",
    "00:07:45",
  ),
  said(
    3,
    "narrated",
    {
      op: "new",
      tempKey: "letter",
      kind: "character_goal",
      name: "The unsigned letter",
      properties: {
        goal: "Find who sent Tamsin's sister's unsigned letter, sealed with a mill wheel",
        progress: "Nobody at the mill recognizes the seal",
        status: "open",
      },
    },
    "I still have that unsigned letter from my sister. The seal had a mill wheel on it.",
    "00:26:30",
  ),
  said(
    3,
    "narrated",
    { op: "relate", type: "pursues", from: "$tamsin", to: "$letter" },
    "I still have that unsigned letter from my sister.",
    "00:26:30",
  ),
];

const lastTime =
  "In the mill yard of the tallow mill at Hollin's Weir, end of the first day. Pulling forward: the missing apprentices Pell and Nia (scratched latch, the party will search the cellar), the night barges of Dace slipping past the weir (the party will watch the weir tomorrow night), and Corwin's debt to Dace, so far only Dace's claim. Harvest fair clock: 1/3, shown; at the fair Reeve Holloway closes the mill. Weir flood clock: 2/4, hidden. Also open: the haunted-cellar rumor and Tamsin's unsigned letter.";

try {
  await call("adventure_start", {
    name: "The Tallow Mill",
    reason: "Invented briefing proof",
  });
  const session = await call<{ id: string }>("session_create", {
    playedOn: "2026-02-07",
  });
  const upload = await call<{ url: string }>("transcript_upload_url", {
    session: session.id,
  });
  const transcript = await readFile(
    new URL("../fixtures/briefing-session.txt", import.meta.url),
  );
  assert.equal(
    (await fetch(upload.url, { method: "PUT", body: transcript })).status,
    200,
  );
  await call("scenes_set", {
    session: session.id,
    scenes: [
      {
        title: "The empty loft",
        start: "00:00:10",
        end: "00:11:59",
        place: "The tallow mill",
        summary:
          "Widow Ferrant hires the party to find Pell and Nia. Corwin shows the loft; the latch is scratched from outside.",
      },
      {
        title: "The reeve's deadline",
        start: "00:12:00",
        end: "00:17:59",
        place: "Town hall",
        summary:
          "Reeve Holloway will close the mill at the harvest fair. The widow keeps the weir gate key, he says.",
      },
      {
        title: "Lanterns on the river",
        start: "00:18:00",
        place: "The weir",
        summary:
          "Dace's barges slip past the weir. Dace names Corwin his debtor and mentions Sister Ulla.",
      },
    ],
  });
  const added = await call<{ rejected: unknown[] }>("debrief_add", {
    session: session.id,
    changes: [...mill, ...hall, ...river],
    lastTime,
  });
  assert.deepEqual(added.rejected, []);
  await call("debrief_commit", { session: session.id });
  const frame = await call<{ value: Record<string, unknown> }>("get", {
    ref: "frame",
  });
  await mkdir(".convex", { recursive: true });
  await writeFile(
    `.convex/briefing-${new URL(url).hostname}.json`,
    JSON.stringify({ session: session.id }),
  );
  console.log(
    `PASS seeded a committed invented debrief with ${mill.length + hall.length + river.length} sourced changes, claims, a rumor, a player guess and plan, two clocks, and an empty frame`,
  );
  console.log(`FRAME ${JSON.stringify(frame.value)}`);
  console.log("BRIEFING FIXTURE READY");
} finally {
  await client.close();
}
