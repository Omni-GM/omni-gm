import {
  defineMcpMutation,
  defineMcpQuery,
  type McpToolRegistration,
} from "convex-mcp-gateway";
import { internal } from "./_generated/api";
import {
  addArgs,
  addResult,
  commitResult,
  sessionArgs as debriefSessionArgs,
  draftResponse,
  dropArgs,
  scenesArgs,
} from "./debrief";
import { adventure, frameUpdateResult, sessionInfo } from "./model";
import { schemaChangeArgs, schemaChangeResult } from "./schemaChanges";
import { findArgs, findResult } from "./search";
import { skillArgs, skillResult } from "./skills";
import {
  adventureArgs,
  frameArgs,
  getArgs,
  getResult,
  sessionArgs,
} from "./store";
import { uploadArgs, uploadResult } from "./uploads";
export const tools: McpToolRegistration[] = [
  defineMcpMutation({
    name: "frame_update",
    description:
      "Change only the given fields of the current adventure frame, with the game master's reason. The frame records intent and never touches story state. Ask about situations and pressure, never outcomes.",
    fn: internal.store.frameUpdate,
    identityArg: "caller",
    args: frameArgs,
    returns: frameUpdateResult,
  }),
  defineMcpMutation({
    name: "schema_change",
    description:
      "Change the campaign schema only on the game master’s explicit request. Add or retire a property, or add a relationship type. Every change records its reason; no new kinds, deletes or renames.",
    fn: internal.schemaChanges.changeSchema,
    identityArg: "caller",
    args: schemaChangeArgs,
    returns: schemaChangeResult,
  }),
  defineMcpQuery({
    name: "skill",
    description:
      "List procedures without a name, or load map-speakers, split-scenes, debrief or frame-talk, including standing rules. Load the matching procedure before a workflow.",
    fn: internal.skills.skill,
    identityArg: "caller",
    args: skillArgs,
    returns: skillResult,
  }),
  defineMcpQuery({
    name: "find",
    description:
      "With no query lists entities and scenes. Search names, aliases, properties, scenes, sources with basis, and transcript utterances by ranked keywords. Each ref feeds get. Up to 8 keywords. kinds filters entity hits only. Limit 1 to 200; defaults 10 search, 100 list.",
    fn: internal.search.find,
    identityArg: "caller",
    args: findArgs,
    returns: findResult,
  }),
  defineMcpMutation({
    name: "scenes_set",
    description:
      "Replace a stored transcript split with scenes. Locked after commit; drop draft changes before splitting again.",
    fn: internal.debrief.scenesSet,
    identityArg: "caller",
    args: scenesArgs,
    returns: sessionInfo,
  }),
  defineMcpMutation({
    name: "debrief_add",
    description:
      "Add scene changes and lastTime to a draft. Invalid changes are rejected individually. A basis of only player_guess/player_plan may touch only a thread or character_goal. Never draft prep.",
    fn: internal.debrief.add,
    identityArg: "caller",
    args: addArgs,
    returns: addResult,
  }),
  defineMcpMutation({
    name: "debrief_drop",
    description:
      "Drop kept changes from a draft by changeIds. Refuses a drop that leaves invalid retained changes and lists their ids and reasons. Returns the draft.",
    fn: internal.debrief.drop,
    identityArg: "caller",
    args: dropArgs,
    returns: draftResponse,
  }),
  defineMcpMutation({
    name: "debrief_commit",
    description:
      "Apply the draft and append history as one commit. Only after the game master says the draft is right.",
    fn: internal.debrief.commit,
    identityArg: "caller",
    args: debriefSessionArgs,
    returns: commitResult,
  }),
  defineMcpMutation({
    name: "transcript_upload_url",
    description:
      "Get a signed single-use URL valid for ten minutes. Upload the file with curl -T; never put its contents in a tool call or output. UTF-8 [HH:MM:SS] Speaker: text, at most 2 MB and 2000 utterances.",
    fn: internal.uploads.uploadUrl,
    identityArg: "caller",
    args: uploadArgs,
    returns: uploadResult,
  }),
  defineMcpMutation({
    name: "adventure_start",
    description:
      "Start an adventure and make it current. On first use creates the campaign with its starter schema.",
    fn: internal.store.adventureStart,
    identityArg: "caller",
    args: adventureArgs,
    returns: adventure,
  }),
  defineMcpMutation({
    name: "session_create",
    description: "Record a played session in the current adventure.",
    fn: internal.store.sessionCreate,
    identityArg: "caller",
    args: sessionArgs,
    returns: sessionInfo,
  }),
  defineMcpQuery({
    name: "get",
    description:
      "Read overview, frame with its history, schema, entity:<id> with history, session:<id>, scene:<session>/<n>, transcript:<session>[@<timestamp>], debrief:<session>.",
    fn: internal.store.get,
    identityArg: "caller",
    args: getArgs,
    returns: getResult,
  }),
];

function describeInput(
  name: string,
  path: string[],
  description: string,
): void {
  const tool = tools.find((t) => t.name === name);
  let value: unknown = tool?.inputSchema;
  for (const key of path) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`Missing input schema for ${name}`);
    value = (value as Record<string, unknown>)[key];
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Missing input schema for ${name}`);
  (value as Record<string, unknown>).description = description;
}
describeInput(
  "debrief_add",
  ["properties", "changes", "items", "properties", "basis"],
  "Where the change comes from. A basis of only player_guess and/or player_plan may touch only thread or character_goal, never an NPC, place, world fact or clock.",
);
describeInput(
  "debrief_add",
  ["properties", "changes", "items", "properties", "sources"],
  "At least one short verbatim transcript quote, or the game master's own answer. With npc_said identify the NPC in the quote or why.",
);
describeInput(
  "session_create",
  ["properties", "playedOn"],
  "Date played, YYYY-MM-DD.",
);

describeInput(
  "frame_update",
  ["properties", "fields"],
  "Only frame fields to change. Omitted fields stay as they are; an empty string clears a field. Intent never changes story state.",
);
describeInput(
  "frame_update",
  ["properties", "reason"],
  "The game master's reason for changing the adventure frame.",
);
