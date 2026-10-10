// PROTOTYPE — throwaway. Plays the AI client's part with the real MCP SDK: drafts the debrief of session 2
// (invented data) and leaves it as a draft for the view. Prints every tool result.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.MCP_URL ?? "http://127.0.0.1:3211/mcp");
const token = process.env.MCP_TOKEN ?? "prototype-local-token";
const client = new Client({ name: "smoke", version: "0" });
await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { authorization: `Bearer ${token}` } } }));

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as any;
  console.log(`\n▶ ${name}${result.isError ? "  ✖ ERROR" : ""}`);
  console.log(result.isError ? result.content[0].text : JSON.stringify(result.structuredContent, null, 2).slice(0, 1200));
  return result.structuredContent;
}

console.log("tools:", (await client.listTools()).tools.map((t) => t.name).join(", "));
await call("story_schema");

const find = async (nameContains: string) => (await call("story_find", { nameContains })).entities[0].id as string;
const maren = await find("Maren");
const docks = await find("Docks");
const vessa = await find("Vessa");
const choir = await find("Choir");
const goal = await find("sister");
const bell = await find("bell");

const adventureId = (await call("story_structure")).adventures[0].id as string;
const sessionId = (
  await call("session_create", {
    adventureId,
    playedOn: "2026-10-03",
    scenes: [
      { title: "Fog at the docks", summary: "Maren denies the bell rang; a net-mender boy saw lights under the water." },
      { title: "The Archive after hours", summary: "An archivist shows the party that the bell records were burned." },
      { title: "Over the roofs", summary: "Something chases the party across the rooftops; the choir hums louder." },
      { title: "Back at the Gull & Lamp", summary: "Vessa promises to get the boy off the docks." },
    ],
  })
).sessionId;

const { debriefId } = await call("debrief_start", {
  sessionId,
  summary:
    "The party pressed the harbor-master, found a witness, learned that the Archive's bell records were burned, and escaped a chase over the roofs. Vessa made a promise to the boy.",
  shortSummary: "Witness Pell saw lights in the bay; bell records burned; the choir is louder; Vessa promised to help Pell.",
});

const t = (line: number, quote: string) => ({ line, quote });
await call("debrief_propose", {
  debriefId,
  changes: [
    { scene: 1, change: { op: "set_property", entity: maren, key: "playedAs", value: "Gruff, chews cloves, goes pale when the bell is named" }, transcript: t(112, "Maren's clove drops. 'There's no bell. There's been no bell for forty years.'"), why: "New tell the GM played: she is afraid of the bell." },
    { scene: 1, change: { op: "create_entity", tempKey: "pell", kind: "npc", name: "Pell", properties: { role: "Net-mender boy on the docks", playedAs: "Fast talker, counts on his fingers", status: "alive" } }, transcript: t(131, "'I saw lights. Under the water. Green ones.'"), why: "Improvised witness." },
    { scene: 1, change: { op: "relate", type: "last_seen_at", from: "$pell", to: docks }, transcript: t(140, "Pell goes back to his nets."), why: "Where the party left him." },
    { scene: 1, change: { op: "set_property", entity: maren, key: "mood", value: "scared" }, transcript: t(112, "Maren's clove drops."), why: "Testing the guard: mood is not in the schema." },
    { scene: 2, change: { op: "create_entity", tempKey: "ilo", kind: "npc", name: "Brother Ilo", properties: { role: "Night archivist of the Lantern Archive", playedAs: "Whispers, keeps snuffing candles", status: "alive" } }, transcript: t(205, "'Shh. The ledgers listen.'"), why: "Improvised NPC who let the party in." },
    { scene: 2, change: { op: "create_entity", tempKey: "archive", kind: "place", name: "The Lantern Archive", properties: { description: "A tower of ledgers lit by a hundred covered lanterns." } }, transcript: t(198, "Every lantern is hooded, every shelf is chained."), why: "New location." },
    { scene: 2, change: { op: "create_entity", tempKey: "sundown", kind: "world_fact", name: "No bells after sundown", properties: { statement: "In Gullwick, ringing any bell after sundown is a crime." } }, transcript: t(214, "'Even the chapel bells stop at dusk. It's the law here.'"), why: "Custom established at the table." },
    { scene: 2, change: { op: "create_entity", tempKey: "burned", kind: "thread", name: "Who burned the bell records?", properties: { question: "Someone burned every Archive page about the drowned bell.", status: "open" } }, transcript: t(231, "The pages for that year are ash."), why: "New lead the players latched onto." },
    { scene: 2, change: { op: "relate", type: "involves", from: "$burned", to: "$ilo" }, transcript: t(233, "Ilo won't look at the ash."), why: "Ilo knows more than he says." },
    { scene: 3, change: { op: "set_property", entity: choir, key: "filled", value: 3 }, transcript: t(301, "The humming is in the roof tiles now."), why: "GM ticked the clock after the chase." },
    { scene: 3, change: { op: "set_property", entity: goal, key: "status", value: "progressing" }, transcript: t(322, "Teo: 'That's Mira's handwriting on the burn list.'"), why: "Teo found his sister's name in the burn log." },
    { scene: 4, change: { op: "create_entity", tempKey: "promise", kind: "thread", name: "Get Pell off the docks", properties: { question: "Vessa promised to find Pell a safe place before the next bell.", status: "open" } }, transcript: t(388, "Vessa: 'I'll get you out of here. Before it rings again.'"), why: "A promise the players made." },
    { scene: 4, change: { op: "relate", type: "involves", from: "$promise", to: vessa }, transcript: t(388, "Vessa: 'I'll get you out of here.'"), why: "Vessa owns the promise." },
    { scene: 4, change: { op: "relate", type: "knows", from: vessa, to: "$pell" }, transcript: t(390, "Pell grins at Vessa."), why: "They have met." },
  ],
});

await call("debrief_show", { debriefId });
await call("story_entity", { entityId: bell, withHistory: true });
console.log(`\nDRAFT_DEBRIEF_ID=${debriefId}`);
await client.close();
