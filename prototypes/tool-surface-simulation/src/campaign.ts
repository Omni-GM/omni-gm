// PROTOTYPE — throwaway. Invented example campaign (public repo): "The Lantern Coast".
// Builds the seed states the tasks start from, through the same Store the server uses.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Store, type ChangeRecord, type State } from "./domain";

const FIXTURES = join(import.meta.dir, "..", "fixtures");
export const transcriptFile = (n: number) => join(FIXTURES, `session-0${n}-transcript.md`);
const transcript = (n: number) => readFileSync(transcriptFile(n), "utf8");

const text = (description: string) => ({ type: "text" as const, description });

const starterSchema: State["schema"] = {
  kinds: [
    {
      kind: "npc",
      label: "NPC",
      description: "A character the GM plays, prepared or improvised.",
      properties: [
        { key: "role", ...text("Who they are in the world, in a few words.") },
        { key: "played_as", ...text("How the GM played them: voice, manner, speech habits, attitude to the party. Required for every NPC the GM voiced.") },
        { key: "wants", ...text("What they want, as shown at the table.") },
        { key: "knows", ...text("What they know that matters to the story.") },
        { key: "status", type: "enum", enumValues: ["alive", "dead", "missing", "unknown"], description: "As far as the table knows." },
      ],
    },
    { kind: "player_character", label: "Player character", description: "A character played by one of the players.", properties: [{ key: "concept", ...text("The character in one line.") }] },
    {
      kind: "place",
      label: "Place",
      description: "A location in the world.",
      properties: [
        { key: "details_shown", ...text("What the players saw there: the GM's descriptions.") },
        { key: "state", ...text("Its current condition, if it changed.") },
      ],
    },
    { kind: "world_fact", label: "World fact", description: "Something the table established about the world: a custom, a law, a past event.", properties: [{ key: "statement", ...text("The fact in one sentence.") }] },
    {
      kind: "thread",
      label: "Thread",
      description: "An open story element the players could follow: a lead, a promise, an unanswered question.",
      properties: [
        { key: "what_is_open", ...text("The open question or promise.") },
        { key: "status", type: "enum", enumValues: ["open", "advanced", "closed"], description: "Where the thread stands." },
        { key: "next_step", ...text("The next step the party can take or plans to take.") },
        { key: "deadline", ...text("A deadline in the world, if any.") },
      ],
    },
    {
      kind: "character_goal",
      label: "Character goal",
      description: "What a player wants for their character.",
      properties: [
        { key: "goal", ...text("The goal in the player's words.") },
        { key: "what_changed", ...text("What changed for this goal most recently.") },
      ],
    },
    {
      kind: "clock",
      label: "Clock",
      description: "A story clock: a track that fills toward an event. Never mechanics.",
      properties: [
        { key: "counts_toward", ...text("What happens when it is full.") },
        { key: "value", type: "number", description: "Filled segments." },
        { key: "segments", type: "number", description: "Total segments." },
        { key: "visible_to_players", type: "enum", enumValues: ["yes", "no"], description: "Shown to the players or kept by the GM." },
      ],
    },
  ],
  relationshipTypes: [
    { type: "last_seen_at", label: "last seen at", inverseLabel: "last place of", from: ["npc", "player_character"], to: ["place"], description: "Where the table last saw them." },
    { type: "is_at", label: "is at", inverseLabel: "who is there", from: ["npc"], to: ["place"], description: "Who lives or works at a place." },
    { type: "raised_by", label: "raised by", inverseLabel: "raised", from: ["thread"], to: ["npc", "player_character", "place", "world_fact"], description: "Who or what raised a thread." },
    { type: "belongs_to", label: "belongs to", inverseLabel: "pursues", from: ["character_goal"], to: ["player_character"], description: "The character a goal belongs to." },
    { type: "involves", label: "involves", inverseLabel: "involved in", from: ["thread", "world_fact"], to: ["npc", "place", "player_character", "world_fact", "clock"], description: "Who or what a thread or fact is about." },
    { type: "located_in", label: "located in", inverseLabel: "contains", from: ["place"], to: ["place"], description: "Place hierarchy." },
    { type: "pressures", label: "pressures", inverseLabel: "pressured by", from: ["clock"], to: ["thread", "place", "player_character"], description: "What a clock pushes on." },
  ],
};

const said = (quote: string, at: string) => [{ quote, at }];

function record(scene: number, change: ChangeRecord["change"], basis: ChangeRecord["basis"], quote: string, at: string, why: string): ChangeRecord {
  return { scene, change, basis, sources: said(quote, at), why };
}

function emptyState(): State {
  return {
    campaign: "The Lantern Coast",
    adventures: [
      {
        id: "a1",
        name: "The Drowned Bell",
        current: true,
        frame: {
          goal: "Find out who rings the drowned bell and stop the Hollow Choir before it rises.",
          stakes: "Fail: the drowned congregation walks into Gullwick. Win: Teo learns where Mira went.",
          timeframe: "Before the choir clock fills.",
          pressure: "The bell rings every second night and the humming grows louder.",
          finale: "Under the bay, in the drowned chapel.",
          moves_main_plot: "Shows that the Archive hid what the bell is.",
          pulls_in: "Teo's sister Mira; Vessa's harbor debt.",
        },
      },
    ],
    sessions: [],
    schema: structuredClone(starterSchema),
    entities: [],
    relationships: [],
    debriefs: [],
    commits: [],
    history: [],
    uploads: {},
    nextId: 1,
  };
}

function playSession(store: Store, n: number, playedOn: string, scenes: Parameters<Store["setScenes"]>[1], changes: ChangeRecord[]) {
  const session = store.createSession(playedOn);
  store.attachTranscript(session.id, transcript(n), "seed");
  store.setScenes(session.id, scenes);
  if (changes.length) {
    const results = store.addToDraft(session.id, changes);
    const failed = results.filter((r) => !r.accepted);
    if (failed.length) throw new Error(`Seed session ${n} rejected: ${JSON.stringify(failed)}`);
    store.commitDebrief(session.id);
  }
}

const session1 = [
  record(1, { op: "new", tempKey: "teo", kind: "player_character", name: "Teo Brand", properties: { concept: "Former Archive letter-runner looking for his sister" } }, ["narrated"], "I'm Teo, I used to run letters for the Archive. I'm here looking for my sister.", "0:00:12", "Player character introduced."),
  record(1, { op: "new", tempKey: "vessa", kind: "player_character", name: "Vessa Quill", properties: { concept: "Hooded smuggler who owes the harbor money" } }, ["narrated"], "She owes the harbor money and doesn't want to be recognized.", "0:00:20", "Player character introduced."),
  record(1, { op: "new", tempKey: "oren", kind: "player_character", name: "Oren", properties: { concept: "Hedge-priest who patches the others up" } }, ["narrated"], "Oren, hedge-priest, I just follow these two around and patch them up.", "0:00:27", "Player character introduced."),
  record(1, { op: "new", tempKey: "docks", kind: "place", name: "Gullwick Docks", properties: { details_shown: "Fog, tar, and gulls; the far piers are rotting." } }, ["narrated"], "Fog, tar, gulls. The piers at the far end are rotting.", "0:00:04", "First location."),
  record(1, { op: "new", tempKey: "maren", kind: "npc", name: "Maren Vosk", properties: { role: "Harbor-master of Gullwick", played_as: "Stomps, chews cloves, never finishes a sentence if she can spit a clove instead", status: "alive" } }, ["narrated"], "That's Maren Vosk, the harbor-master. She never finishes a sentence if she can spit a clove instead.", "0:01:02", "NPC who warned the party off."),
  record(1, { op: "relate", type: "last_seen_at", from: "$maren", to: "$docks" }, ["narrated"], "A woman stomps down the pier toward you", "0:00:40", "Where the party met her."),
  record(1, { op: "new", tempKey: "pellow", kind: "world_fact", name: "The Pellow boys walked into the sea", properties: { statement: "Last time the bell rang, the Pellow boys walked into the sea and never came out." } }, ["npc_said"], "Last time that bell rang, the Pellow boys walked into the sea and never came out.", "0:00:48", "Maren's claim about the bell's history."),
  record(2, { op: "new", tempKey: "chapel", kind: "place", name: "The drowned chapel", aliases: ["old chapel"], properties: { details_shown: "Sank into the bay with its bell." } }, ["npc_said"], "The one that sank with the chapel.", "0:01:13", "The bell's origin."),
  record(2, { op: "new", tempKey: "bell", kind: "thread", name: "Who rang the drowned bell?", properties: { what_is_open: "Who or what rings a bell that sank with the old chapel?", status: "open" } }, ["narrated"], "At midnight, from under the bay, a bell rings. Twelve times.", "0:06:30", "The adventure's opening mystery."),
  record(2, { op: "new", tempKey: "choir", kind: "clock", name: "The Hollow Choir rises", properties: { counts_toward: "The drowned congregation walks out of the bay.", value: 1, segments: 6, visible_to_players: "no" } }, ["narrated"], "Something hums along with it, low, like a choir.", "0:06:30", "Hidden pressure clock."),
  record(2, { op: "relate", type: "pressures", from: "$choir", to: "$bell" }, ["narrated"], "Something hums along with it, low, like a choir.", "0:06:30", "The clock drives the mystery."),
  record(2, { op: "new", tempKey: "goal", kind: "character_goal", name: "Find out why Mira left the Archive", properties: { goal: "Learn why my sister Mira walked out of the Archive and never came back.", what_changed: "Mira heard the bell the night she left." } }, ["narrated"], "Mira heard that bell too. The night she left. She wrote about it.", "0:06:45", "Teo tied his goal to the bell."),
  record(2, { op: "relate", type: "belongs_to", from: "$goal", to: "$teo" }, ["narrated"], "Mira heard that bell too.", "0:06:45", "Teo's goal."),
];

const session2 = (s: Store) => [
  record(1, { op: "new", tempKey: "hesk", kind: "npc", name: "Old Hesk", properties: { role: "Ferryman across the estuary", played_as: "Hums sea shanties out of tune, calls everyone \"lamb\"", status: "dead" } }, ["narrated"], "He's grey and cold and not breathing that you can tell.", "0:02:58", "Ferryman who went overboard."),
  record(2, { op: "new", tempKey: "annex", kind: "place", name: "Archive annex", properties: { details_shown: "A mural of the old chapel: monks in white under a pale abbot holding a bell rope, his eyes painted over." } }, ["narrated"], "In the Archive annex there's a mural of the old chapel", "0:05:10", "Where the mural is."),
  record(2, { op: "new", tempKey: "abbot", kind: "npc", name: "The Pale Abbot", properties: { role: "Figure in the chapel mural holding the bell rope; nobody knows who he was", status: "unknown" } }, ["narrated"], "The archivist just calls him the Pale Abbot and says nobody knows.", "0:05:28", "Central figure of the bell mystery."),
  record(2, { op: "new", tempKey: "who", kind: "thread", name: "Who is the Pale Abbot?", properties: { what_is_open: "Who was the abbot painted holding the bell rope?", status: "open" } }, ["narrated"], "Who's the abbot?", "0:05:25", "Open question the players raised."),
  record(2, { op: "relate", type: "involves", from: "$who", to: "$abbot" }, ["narrated"], "The archivist just calls him the Pale Abbot", "0:05:28", "Thread is about the abbot."),
  record(2, { op: "new", tempKey: "mine", kind: "place", name: "Saltmere Mine", properties: { details_shown: "Up the cliff path, closed for forty years.", state: "closed" } }, ["narrated"], "Saltmere, up the cliff path, closed for forty years.", "0:08:50", "Lead the party may follow."),
  record(2, { op: "new", tempKey: "metal", kind: "world_fact", name: "The bell metal came from Saltmere", properties: { statement: "The chapel's bell was cast from metal mined at Saltmere." } }, ["npc_said"], "the archivist said the chapel's bell metal came from there", "0:08:40", "Links the mine to the bell."),
  record(2, { op: "update", entity: s.entity("The Hollow Choir rises").id, properties: { value: 2 } }, ["narrated"], "River's angry since the bell.", "0:00:14", "The bell rang again."),
];

const session1Scenes = [
  { title: "Arrival in Gullwick", start: "0:00:04", end: "0:06:29", place: "Gullwick Docks", summary: "The party lands; Maren Vosk warns them off and mentions the Pellow boys." },
  { title: "The bell at midnight", start: "0:06:30", place: "Gullwick Docks", summary: "The drowned bell rings twelve times; a choir hums; Teo says Mira heard it too." },
];
const session2Scenes = [
  { title: "The ferry", start: "0:00:05", end: "0:05:09", place: "Estuary ferry", summary: "Old Hesk ferries the party; he goes overboard and seems dead." },
  { title: "The Archive annex", start: "0:05:10", place: "Archive annex", summary: "A mural shows the Pale Abbot with the bell rope; the archivist points them to Saltmere Mine." },
];
export const goldScenes3 = [
  { title: "A boat at pier four", start: "0:00:05", end: "0:05:47", place: "Gullwick Docks", summary: "Sela Thorn, a tide-reader, agrees to row the party to the chapel by day only; she says Saltmere flooded the night the bell first rang." },
  { title: "Saltmere Mine", start: "0:05:48", end: "0:13:39", place: "Saltmere Mine", summary: "Warm flooded tunnel with floating hymn-book pages; one has \"M. Brand\" in Mira's hand. Vessa and Oren suspect Maren." },
  { title: "The shore at midnight", start: "0:13:40", end: "0:19:49", place: "The drowned chapel", summary: "Fishermen warn of the Kelp Mother; the bell rings, the humming is louder, pale shapes stand in rows under the water." },
  { title: "The Tarred Gull", start: "0:19:50", place: "The Tarred Gull", summary: "Bram the innkeeper serves stew; the party plans to dive to the chapel at low tide at first light." },
];

const session3Gold = (s: Store) => [
  record(1, { op: "new", tempKey: "sela", kind: "npc", name: "Sela Thorn", aliases: ["Sella"], properties: { role: "Tide-reader who rows boats near the bell water", played_as: "Whispers as if the water might hear; never looks you in the eye, keeps her gaze on the tide line", status: "alive" } }, ["narrated"], "She talks in a whisper, like the water might hear her, and she never once looks you in the eye.", "0:00:42", "Improvised NPC who will row the party."),
  record(1, { op: "relate", type: "last_seen_at", from: "$sela", to: s.entity("Gullwick Docks").id }, ["narrated"], "she'll be at pier four tomorrow at first light", "0:01:39", "Where the party left her."),
  record(1, { op: "new", tempKey: "flood", kind: "world_fact", name: "Saltmere flooded when the bell first rang", properties: { statement: "Saltmere Mine flooded the same night the bell first rang, forty years ago, and the water came up warm." } }, ["npc_said"], "Saltmere flooded the same night the bell first rang. Forty years ago. My grandmother said the water came up warm.", "0:01:26", "Sela's claim links the mine to the bell."),
  record(2, { op: "update", entity: s.entity("Saltmere Mine").id, properties: { details_shown: "Black mouth in the chalk, rotting timber, a rusted cart; warm air smelling of candle wax. Flooded thirty paces in with warm black water and floating hymn-book pages.", state: "flooded" } }, ["narrated"], "About thirty paces in, the tunnel floods. Black water, and it's warm to the touch.", "0:06:24", "What the party found in the mine."),
  record(2, { op: "update", entity: s.entity("Find out why Mira left the Archive").id, properties: { what_changed: "Teo found a hymn page in Saltmere Mine with \"M. Brand\" in Mira's handwriting: she was there." } }, ["narrated"], "And in the margin, in pencil, someone wrote \"M. Brand\".", "0:06:44", "Clue to Mira's trail."),
  record(3, { op: "update", entity: s.entity("The drowned chapel").id, properties: { details_shown: "At low water the bell tower and two broken arches stick out of the bay, hung with seaweed. At midnight pale shapes stand in rows on the chapel floor like a congregation." } }, ["narrated"], "Pale shapes, standing on the chapel floor under the water, in rows. Like a congregation.", "0:15:33", "What the party saw."),
  record(3, { op: "new", kind: "world_fact", name: "The Kelp Mother", properties: { statement: "Fishermen say the Kelp Mother pulls children who stand too close to the water down by the ankles." } }, ["rumor"], "The Kelp Mother takes children who stand that close.", "0:14:24", "Local rumor; not an NPC."),
  record(3, { op: "update", entity: s.entity("The Hollow Choir rises").id, properties: { value: 3 } }, ["narrated"], "That's the choir clock at three of six.", "0:15:24", "The bell rang and the humming grew."),
  record(3, { op: "update", entity: s.entity("Who rang the drowned bell?").id, properties: { status: "advanced" } }, ["narrated"], "the bell rings again under the water. Twelve times.", "0:15:10", "The bell rang again with a visible congregation."),
  record(4, { op: "update", entity: s.entity("Who rang the drowned bell?").id, properties: { next_step: "Dive to the drowned chapel at low tide at first light; Sela rows them out." } }, ["player_plan"], "So tomorrow, first light, Sela rows us out and we dive to the chapel at low tide.", "0:20:20", "The party's plan for next session."),
  record(4, { op: "new", tempKey: "gull", kind: "place", name: "The Tarred Gull", properties: { details_shown: "Tavern by the docks; fire going, smells of tar and fish stew." } }, ["narrated"], "the Tarred Gull, the tavern by the docks. Fire going, it smells of tar and fish stew.", "0:19:50", "New location."),
  record(4, { op: "new", tempKey: "bram", kind: "npc", name: "Bram", properties: { role: "Innkeeper of the Tarred Gull", played_as: "Huge, red beard, laughs at his own jokes, wipes the same mug while he talks", status: "alive" } }, ["narrated"], "Bram is huge, red beard, laughs at his own jokes", "0:20:48", "Improvised NPC."),
  record(4, { op: "relate", type: "is_at", from: "$bram", to: "$gull" }, ["narrated"], "The innkeeper, Bram", "0:20:35", "Bram runs the inn."),
];

export function seedBeforeSession3(): State {
  const store = new Store(emptyState());
  playSession(store, 1, "2026-09-26", session1Scenes, session1);
  playSession(store, 2, "2026-10-03", session2Scenes, session2(store));
  return store.state;
}

export function seedSession3Uploaded(): State {
  const store = new Store(seedBeforeSession3());
  const session = store.createSession("2026-10-10");
  store.attachTranscript(session.id, transcript(3), "seed");
  store.setScenes(session.id, goldScenes3);
  return store.state;
}

export function seedAfterSession3(): State {
  const store = new Store(seedSession3Uploaded());
  const results = store.addToDraft("s3", session3Gold(store));
  const failed = results.filter((r) => !r.accepted);
  if (failed.length) throw new Error(`Gold debrief rejected: ${JSON.stringify(failed)}`);
  store.commitDebrief("s3");
  return store.state;
}

if (import.meta.main) {
  const s = new Store(seedAfterSession3());
  console.log(JSON.stringify(s.overview(), null, 2));
  console.log(JSON.stringify(s.find("what do the players know about the Saltmere mine").hits.slice(0, 5), null, 2));
}
