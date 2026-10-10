// PROTOTYPE — throwaway. Invented example data only (public repo).
// Seeds one campaign: the starter schema, one adventure, and session 1 as the seed baseline.
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const starterSchema = [
  { op: "add_kind", kind: "npc", label: "NPC", description: "A character the GM plays." },
  { op: "add_property", kind: "npc", key: "role", valueType: "text", description: "Who they are in the world, in a few words." },
  { op: "add_property", kind: "npc", key: "playedAs", valueType: "text", description: "How the GM played them: voice, manner, tics." },
  { op: "add_property", kind: "npc", key: "status", valueType: "enum", enumValues: ["alive", "dead", "missing", "unknown"], description: "As far as the table knows." },
  { op: "add_kind", kind: "player_character", label: "Player character", description: "A character played by one of the players." },
  { op: "add_property", kind: "player_character", key: "concept", valueType: "text", description: "The character in one line." },
  { op: "add_kind", kind: "place", label: "Place", description: "A location in the world." },
  { op: "add_property", kind: "place", key: "description", valueType: "text", description: "What the players saw there." },
  { op: "add_kind", kind: "world_fact", label: "World fact", description: "Something the table established as true: a custom, a law, a past event." },
  { op: "add_property", kind: "world_fact", key: "statement", valueType: "text", description: "The fact in one sentence." },
  { op: "add_kind", kind: "thread", label: "Thread", description: "An open story element the players could follow." },
  { op: "add_property", kind: "thread", key: "question", valueType: "text", description: "The open question or promise." },
  { op: "add_property", kind: "thread", key: "status", valueType: "enum", enumValues: ["open", "resolved", "dropped"], description: "Where the thread stands." },
  { op: "add_kind", kind: "character_goal", label: "Character goal", description: "What a player wants for their character." },
  { op: "add_property", kind: "character_goal", key: "goal", valueType: "text", description: "The goal in the player's words." },
  { op: "add_property", kind: "character_goal", key: "status", valueType: "enum", enumValues: ["open", "progressing", "fulfilled", "abandoned"], description: "Progress so far." },
  { op: "add_kind", kind: "clock", label: "Clock", description: "A track that fills toward an event." },
  { op: "add_property", kind: "clock", key: "segments", valueType: "number", description: "Total segments." },
  { op: "add_property", kind: "clock", key: "filled", valueType: "number", description: "Filled segments." },
  { op: "add_property", kind: "clock", key: "visibility", valueType: "enum", enumValues: ["shown", "hidden"], description: "Shown to the players or kept by the GM." },
  { op: "add_property", kind: "clock", key: "whenFull", valueType: "text", description: "What happens when it fills." },
  { op: "add_relationship_type", type: "last_seen_at", label: "last seen at", inverseLabel: "last place of", fromKinds: ["npc", "player_character"], toKinds: ["place"], description: "Where the table last saw them." },
  { op: "add_relationship_type", type: "located_in", label: "located in", inverseLabel: "contains", fromKinds: ["place"], toKinds: ["place"], description: "Place hierarchy." },
  { op: "add_relationship_type", type: "involves", label: "involves", inverseLabel: "involved in", fromKinds: ["thread", "world_fact"], toKinds: ["npc", "place", "player_character", "world_fact"], description: "Who or what a thread or fact is about." },
  { op: "add_relationship_type", type: "pursues", label: "pursues", inverseLabel: "pursued by", fromKinds: ["player_character"], toKinds: ["character_goal"], description: "A character's goal." },
  { op: "add_relationship_type", type: "pressures", label: "pressures", inverseLabel: "pressured by", fromKinds: ["clock"], toKinds: ["thread", "player_character", "place"], description: "What the clock pushes on." },
  { op: "add_relationship_type", type: "knows", label: "knows", inverseLabel: "known by", fromKinds: ["npc", "player_character"], toKinds: ["npc", "player_character"], description: "They have met and remember each other." },
] as const;

export const createCampaign = internalMutation({
  args: {},
  handler: async (ctx) => {
    const campaignId = await ctx.db.insert("campaigns", { ownerId: "local", name: "The Lantern Coast" });
    const adventureId = await ctx.db.insert("adventures", { campaignId, name: "The Drowned Bell", ordinal: 1 });
    return { campaignId, adventureId };
  },
});

export const run = internalAction({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx): Promise<unknown> => {
    const existing = await ctx.runQuery(internal.store.campaignForOwner, { ownerId: "local" });
    if (existing) return { skipped: "already seeded", campaignId: existing._id };
    const { campaignId, adventureId } = await ctx.runMutation(internal.seed.createCampaign, {});
    await ctx.runMutation(internal.store.changeSchema, {
      campaignId,
      reason: "Starter schema",
      kind: "seed",
      ops: starterSchema as any,
    });
    const sessionId = await ctx.runMutation(internal.store.createSession, {
      campaignId,
      adventureId,
      playedOn: "2026-09-26",
      scenes: [
        { title: "Arrival in Gullwick", summary: "The party lands at the docks; the harbor-master warns them off." },
        { title: "The bell in the night", summary: "A drowned bell rings from under the bay at midnight." },
      ],
    });
    const debriefId = await ctx.runMutation(internal.store.startDebrief, {
      sessionId,
      summary: "The party arrives in Gullwick and hears the drowned bell ring at midnight.",
      shortSummary: "Arrived in Gullwick; the drowned bell rang.",
    });
    const t = (line: number, quote: string) => ({ line, quote });
    await ctx.runMutation(internal.store.proposeChanges, {
      debriefId,
      changes: [
        { scene: 1, change: { op: "create_entity", tempKey: "teo", kind: "player_character", name: "Teo Brand", properties: { concept: "Ex-archive runner looking for his sister" } }, transcript: t(4, "I'm Teo, I used to run letters for the Archive."), why: "Player character introduced." },
        { scene: 1, change: { op: "create_entity", tempKey: "vessa", kind: "player_character", name: "Vessa Quill", properties: { concept: "Smuggler with a debt to the harbor" } }, transcript: t(6, "Vessa keeps her hood up."), why: "Player character introduced." },
        { scene: 1, change: { op: "create_entity", tempKey: "docks", kind: "place", name: "Gullwick Docks", properties: { description: "Fog, tar, and gulls; piers rotting at the far end." } }, transcript: t(12, "The fog sits on the water like wet wool."), why: "First scene location." },
        { scene: 1, change: { op: "create_entity", tempKey: "maren", kind: "npc", name: "Maren Vosk", properties: { role: "Harbor-master of Gullwick", playedAs: "Gruff, chews cloves, never finishes a sentence", status: "alive" } }, transcript: t(18, "Maren spits a clove. 'You lot don't want to be here after—'"), why: "Improvised NPC who warned the party off." },
        { scene: 1, change: { op: "relate", type: "last_seen_at", from: "$maren", to: "$docks" }, transcript: t(31, "She stomps back into the harbor office."), why: "Where the party left her." },
        { scene: 2, change: { op: "create_entity", tempKey: "bell", kind: "thread", name: "Who rang the drowned bell?", properties: { question: "Who or what rang a bell that sank with the old chapel?", status: "open" } }, transcript: t(58, "Under the water, a bell rings. Twelve times."), why: "The adventure's opening mystery." },
        { scene: 2, change: { op: "create_entity", tempKey: "choir", kind: "clock", name: "The Hollow Choir rises", properties: { segments: 6, filled: 2, visibility: "hidden", whenFull: "The drowned congregation walks out of the bay." } }, transcript: t(61, "Something hums along with the bell."), why: "GM started a hidden pressure clock at the table." },
        { scene: 2, change: { op: "relate", type: "pressures", from: "$choir", to: "$bell" }, transcript: t(61, "Something hums along with the bell."), why: "The clock drives the bell mystery." },
        { scene: 2, change: { op: "create_entity", tempKey: "goal", kind: "character_goal", name: "Find out why Teo's sister left the Archive", properties: { goal: "Learn why my sister walked out of the Archive and never came back", status: "open" } }, transcript: t(70, "Teo: 'Mira heard that bell too, the night she left.'"), why: "Player tied his goal to the bell." },
        { scene: 2, change: { op: "relate", type: "pursues", from: "$teo", to: "$goal" }, transcript: t(70, "Teo: 'Mira heard that bell too, the night she left.'"), why: "Goal belongs to Teo." },
      ] as any,
    });
    await ctx.runMutation(internal.store.commitDebrief, { debriefId });
    return { campaignId, adventureId, seededSession: sessionId };
  },
});

const TABLES = [
  "campaigns", "adventures", "sessions", "scenes", "kindDefinitions", "propertyDefinitions", "relationshipDefinitions",
  "entities", "relationships", "debriefs", "draftChanges", "commits", "history",
] as const;

export const wipe = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of TABLES) for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id);
  },
});
