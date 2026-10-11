import { ConvexError, type Infer, v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { callerArgs } from "./store";
export const standingRules = `Never draft prep. Propose only on the game master's explicit request, at most three situations built from story-state facts with sources.
Ask about situations and pressure, never player decisions or outcomes.
Story state records what happened. The adventure frame records intent. Keep them apart.
Write in the game master's language.`;
export const instructions = `Load the matching procedure with skill before starting a workflow.\n${standingRules}`;
const procedures: Record<string, { description: string; procedure: string }> = {
  "map-speakers": {
    description:
      "Map transcript speakers to the game master, players and characters.",
    procedure: `Read get overview, then get transcript:<session> or a timestamp window. Upload a file by calling transcript_upload_url and using curl -T <file> <signed-url> from disk. Never echo, cat or repeat the transcript in output. The URL expires after ten minutes and is single-use. The format is UTF-8 [HH:MM:SS] Speaker: text, with continuation lines allowed; at most 2 MB and 2000 utterances.
Map each speaker to game master, player and player character, or unknown. GM NPC voices can have separate labels. Use the content, not the label alone. Do not guess an unclear identity. Ask only when its answer changes story state. Keep this mapping in the conversation, not in invented schema properties.
Keep alternate spellings as entity aliases after confirming they name the same person. A rumor figure stays in the rumor and is not an NPC just because named.`,
  },
  "split-scenes": {
    description:
      "Split a stored transcript into continuous places and situations.",
    procedure: `Load skill map-speakers and map the speakers. Read get transcript:<session> in windows if needed; never repeat the transcript in output.
Split into scenes at changes of place or situation. Give each a short title, start and optional end timestamp, place and a summary of plot points in one or two lines. Keep the original timestamps. Do not overlap scenes. Leave out rolls, rests, hit points and inventory.
Call scenes_set with the session and scenes in order. Use get scene:<session>/<n> to check a scene with its utterances. Splitting replaces earlier scenes, so drop existing draft changes first; a committed debrief and its scenes are closed.`,
  },
  debrief: {
    description:
      "Draft story-state changes scene by scene for the game master to review.",
    procedure: `Start with get overview and get schema, then find without a query to see the committed story state. If this is first use, adventure_start creates the campaign and starter schema; session_create records the played date in the current adventure. The first debrief seeds from the latest session and, if offered, the earlier session note. Do not bulk-import older sessions.
Load skill map-speakers and skill split-scenes. Upload from disk with transcript_upload_url and curl -T, never putting the file in a tool call or output. Use the stored utterances and scenes.
Walk each scene in order. Use find by name and aliases before creating an entity. Record every named NPC who speaks or is named in play, but keep a person existing only in a rumor inside that rumor. For each NPC the game master voiced, fill playedAs from the actual voice and manner. Preserve spelling variants as aliases. Do not invent motives, secrets, properties or kinds. Fill only fields supported by the session. Leave out mechanics, rolls, rests, hit points and inventory.
Each change needs scene, change, a non-empty basis list, at least one short verbatim source {quote, at?}, and why. Use basis narrated for narration, npc_said for an NPC claim, rumor for a rumor, player_guess or player_plan for those, and game_master for the GM's own answer. With npc_said identify the speaking NPC in the quote or why. A basis consisting only of player_guess/player_plan may touch only thread or character_goal, never an NPC, place, world fact or clock. Facts, claims, rumors and guesses must stay apart.
Operations are new {kind,name,tempKey?,aliases?,properties?}, update {entity,properties?,addAliases?}, relate/unrelate {type,from,to}. Entity refs are ids or $tempKey from an earlier accepted new change in this draft. Read the allowed properties, enum values and relationship endpoint kinds from schema. A relationship touches both endpoints. Merge repeated updates within a scene where possible.
Call debrief_add with proposed changes and lastTime. It keeps valid changes and rejects invalid ones individually with allowed lists. Fix a rejected change; do not work around its rule. Review get debrief:<session> in scene order. Clients with MCP Apps show the Ledger view for debrief_add and debrief_drop, where the game master can drop changes; read get debrief:<session> again before debrief_commit. To fix a kept change, debrief_drop its id and add the replacement. Dropping a parent refuses to break dependent changes and lists their ids. Drop them together, then add replacements in dependency order.
Write lastTime plot-first: one line where the party is and when; three to five pulling-forward threads, where each stands, what changed, and what pulls the party toward it; each ticking clock with its value; and other open threads, one line each. Use fewer threads if fewer exist, never invent padding. Keep the current story state and lastTime compact enough to read at prep.
Ask at most five open questions, each with a timestamp, only if the answer changes story state. Never ask what the players will decide. Deliberate GM vagueness stays as said and is not a question. Questions stay in chat, not the store. A GM answer is basis game_master with their words as source.
Show lastTime, the compact story state and changes by scene for review. Call debrief_commit only after the game master says the draft is right. It applies the entire draft and appends history atomically. A committed debrief never changes; later fixes need story_commit, which is outside this slice. At prep use get overview for lastTime, find for an NPC's aliases, and get entity:<id> for playedAs, relationships and history with session, scene, basis, quote and why.`,
  },
};
export const skillArgs = { ...callerArgs, name: v.optional(v.string()) };
export const skillResult = v.object({
  skills: v.array(v.object({ name: v.string(), description: v.string() })),
  name: v.optional(v.string()),
  procedure: v.optional(v.string()),
});
export const skill = internalQuery({
  args: skillArgs,
  returns: skillResult,
  handler: async (_ctx, { name }): Promise<Infer<typeof skillResult>> => {
    const skills = Object.entries(procedures).map(([name, p]) => ({
      name,
      description: p.description,
    }));
    if (name === undefined) return { skills };
    const key = name
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, "-");
    const p = procedures[key];
    if (!Object.hasOwn(procedures, key))
      throw new ConvexError(
        `Allowed skills: ${Object.keys(procedures).join(", ")}`,
      );
    return {
      skills: [],
      name: key,
      procedure: `${p.procedure}\n\nStanding rules\n${standingRules}`,
    };
  },
});
