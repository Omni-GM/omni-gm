import {
  defineMcpMutation,
  defineMcpQuery,
  type McpToolRegistration,
} from "convex-mcp-gateway";
import { internal } from "./_generated/api";
import { checklistArgs, checklistResult } from "./checklists";
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
import { secretArgs, secretResult } from "./secrets";
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
    name: "secret_write",
    description:
      "Write or change the game master's unplayed background with a reason. Secrets live apart from story state. op write needs text and optional about entity refs; change needs secret and text and/or about. fix needs secret and storyCommit from story_commit with game_master basis and either the secret's exact text as a source quote or its full ref in the change's why; drop needs secret. Each write appends before/after history. Text at most 16 KB, reason 2 KB, about at most 50 owner-scoped entity refs; all refs at most 200 bytes.",
    fn: internal.secrets.write,
    identityArg: "caller",
    args: secretArgs,
    returns: secretResult,
  }),
  defineMcpMutation({
    name: "checklist_set",
    description:
      "Replace the campaign's ordered prep sections, their definitions and the markdown session-note template with the game master's non-empty reason. Keeps earlier versions in history. Read with get checklist. Requires 1 to 100 sections with non-empty, unique names and definitions, and a non-empty template. Sections, template and reason together must fit within 32 KB of UTF-8 JSON. All or nothing.",
    fn: internal.checklists.set,
    identityArg: "caller",
    args: checklistArgs,
    returns: checklistResult,
  }),
  defineMcpMutation({
    name: "story_commit",
    description:
      "Commit corrections and secrets the game master declares fixed outside a debrief, with a reason. All or nothing. A basis of only player_guess/player_plan may touch only thread or character_goal.",
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
      "Add scene changes and the draft briefing to a draft. Invalid changes are rejected individually. A basis of only player_guess/player_plan may touch only a thread or character_goal.",
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
      "Apply the draft, append history and keep its briefing as one commit. Refused without a briefing. Only after the game master says the draft is right.",
    fn: internal.debrief.commit,
    identityArg: "caller",
    args: debriefSessionArgs,
    returns: commitResult,
  }),
  defineMcpMutation({
    name: "transcript_upload_url",
    description:
      "With a shell, upload the transcript yourself from disk with curl -T to this signed single-use URL, valid for ten minutes; no transcript in tool calls or chat output. Without a shell or without the original file on disk, immediately give the game master pageUrl to sign in and upload the original file. Never retype the transcript in tool calls or chat. After they upload, read get transcript:<session> to confirm it is stored before the debrief. UTF-8 [HH:MM:SS] Speaker: text, at most 8 MB and 20000 utterances.",
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
      "Read overview with openSecrets count, frame with its history, checklist with ordered sections, definitions, markdown template and replacement history, schema, secrets (hidden and partly_revealed), secret:<id> with history, entity:<id> with history, session:<id>, scene:<session>/<n>, transcript:<session>[@<timestamp>], debrief:<session>. checklist is null when not yet stored. Secrets, transcript, scene and history reads return pages with truncated and nextCursor. Follow nextCursor as cursor with the same single ref until it is null. limit accepts 1 to 200, default 100; byte budgets can shorten pages and history returns at most ten changes. Batch items carry independent cursors; continue them individually. Download URLs require the owner's bearer sign-in.",
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
  "Where the change comes from. Corrections and declared-fixed secrets use game_master. Unplayed plank answers go to secret_write. A basis of only player_guess and/or player_plan may touch only thread or character_goal.",
);
describeInput(
  "story_commit",
  ["properties", "changes", "items", "properties", "sources"],
  "At least one short verbatim source quote. For game_master use their own answer; with npc_said identify the NPC in quote or why.",
);
