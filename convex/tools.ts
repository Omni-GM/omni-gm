import {
  defineMcpAction,
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
  storyArgs,
  storyResult,
} from "./debrief";
import { carriesLedger } from "./ledger";
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
import { appendArgs, appendResult } from "./transcriptAppend";
import { uploadArgs, uploadResult } from "./uploads";
export const tools: McpToolRegistration[] = [
  defineMcpAction({
    name: "transcript_append",
    description:
      "Without a shell, upload the transcript yourself in exact ordered chunks of at most 64000 UTF-8 bytes. At most 128 chunks. Start index at 0, increase by 1, set final only on the last chunk. Identical retries are safe, including the final chunk. Use nextIndex after an ordering error. To replace bad input or cancel an incomplete upload, use restart: true at index 0 and resend every chunk. The chunk upload expires after one hour. Preserve all text and line endings; never split a Unicode character. At most 8 MB and 20000 utterances. Never ask the game master to upload when this tool is available. With a shell, use transcript_upload_url and curl -T from disk instead.",
    fn: internal.transcriptAppend.append,
    identityArg: "caller",
    args: appendArgs,
    returns: appendResult,
  }),
  defineMcpMutation({
    name: "story_commit",
    description:
      "Commit corrections, store corrections the game master confirmed, and their plank answers outside a debrief, with a reason. All or nothing. A basis of only player_guess/player_plan may touch only thread or character_goal.",
    fn: internal.debrief.storyCommit,
    identityArg: "caller",
    args: storyArgs,
    returns: storyResult,
  }),
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
      "List procedures without a name, or load briefing, prep-sparring, plank-questions, frame-talk, map-speakers, split-scenes or debrief, including standing rules. Prep opens with briefing. Load the matching procedure before a workflow.",
    fn: internal.skills.skill,
    identityArg: "caller",
    args: skillArgs,
    returns: skillResult,
  }),
  defineMcpQuery({
    name: "find",
    description:
      "With no query lists entities and scenes. Search names, aliases, properties, scenes, sources with basis, and transcript utterances by keywords. Results are grouped by type and ranked within each page. Each ref feeds get; id distinguishes hits sharing a ref. Up to 8 keywords. kinds filters entity hits only. Limit 1 to 200; defaults 10 search, 100 list. Follow nextCursor with the same arguments as cursor while truncated, even on an empty page. total is cumulative and a lower bound until totalIsExact.",
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
      "Add scene changes and lastTime to a draft. Invalid changes are rejected individually. A basis of only player_guess/player_plan may touch only a thread or character_goal.",
    fn: internal.debrief.add,
    identityArg: "caller",
    args: addArgs,
    returns: addResult,
    _meta: carriesLedger,
  }),
  defineMcpMutation({
    name: "debrief_drop",
    description:
      "Drop kept changes from a draft by changeIds. Refuses a drop that leaves invalid retained changes and names them by scene and subject. Returns the draft.",
    fn: internal.debrief.drop,
    identityArg: "caller",
    args: dropArgs,
    returns: draftResponse,
    _meta: carriesLedger,
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
      "With a shell, upload the transcript yourself from disk with curl -T to this signed single-use URL, valid for ten minutes; no transcript in tool calls or chat output. Without a shell, upload it yourself through transcript_append. Never ask the game master to upload when a tool path exists. pageUrl is a signed-in fallback only if neither path can access the transcript. UTF-8 [HH:MM:SS] Speaker: text, at most 8 MB and 20000 utterances.",
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
      "Read overview, frame with its history, schema, entity:<id> with history, session:<id>, scene:<session>/<n>, transcript:<session>[@<timestamp>], debrief:<session>. Transcript, scene and history reads return pages with truncated and nextCursor. Follow nextCursor as cursor with the same single ref until it is null. limit accepts 1 to 200, default 100; byte budgets can shorten pages and history returns at most ten changes. Batch items carry independent cursors; continue them individually. Download URLs require the owner's bearer sign-in.",
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

describeInput(
  "story_commit",
  ["properties", "changes", "items", "properties", "basis"],
  "Where the change comes from. Plank answers use game_master. A basis of only player_guess and/or player_plan may touch only thread or character_goal.",
);
describeInput(
  "story_commit",
  ["properties", "changes", "items", "properties", "sources"],
  "At least one short verbatim source quote. For game_master use their own answer; with npc_said identify the NPC in quote or why.",
);
