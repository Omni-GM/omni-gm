// PROTOTYPE — throwaway. The four tool surfaces under test, all over the same Store.
// A: few deep tools (the spec draft). B: many narrow verbs. C: narrow writes + find/get + skill tool.
// D: C without the skill tool; the procedures ride in the server instructions instead.
import { z } from "zod";
import { BASES, FRAME_FIELDS, Rejection, type Store } from "./domain";
import { PROCEDURES, STANDING_RULES, procedureList } from "./procedures";

export type Surface = "A" | "B" | "C" | "D" | "E";
export type Upload = { mode: "signed" | "page"; urlFor: (sessionId: string) => string };
export type Ctx = { store: Store; upload: Upload };
export type Tool = { name: string; description: string; schema: z.ZodObject; write: boolean; run: (args: any, ctx: Ctx) => unknown };

// ---------- shared input pieces ----------

const value = z.union([z.string(), z.number()]);
const properties = z.record(z.string(), value).describe("Property key -> value. Only keys the schema allows for the kind.");
const basis = z.array(z.enum(BASES)).min(1).describe("Where the change comes from. A player_guess or player_plan may only touch a thread or character_goal.");
const sources = z
  .array(z.object({ quote: z.string().describe("Verbatim quote from the transcript, or the GM's own words."), at: z.string().optional().describe('Timestamp like "0:14:02".') }))
  .min(1);
const why = z.string().describe("One short sentence: why this changes the story state.");
const entityRef = z.string().describe('An entity id (e.g. "e12"), or "$tempKey" for an entity created earlier in the same batch or draft.');

const change = z.discriminatedUnion("op", [
  z.object({ op: z.literal("new"), tempKey: z.string().optional().describe("Lets later changes refer to it as $tempKey."), kind: z.string(), name: z.string(), aliases: z.array(z.string()).optional(), properties: properties.optional() }),
  z.object({ op: z.literal("update"), entity: entityRef, properties: properties.optional(), addAliases: z.array(z.string()).optional() }),
  z.object({ op: z.literal("relate"), type: z.string(), from: entityRef, to: entityRef }),
  z.object({ op: z.literal("unrelate"), type: z.string(), from: entityRef, to: entityRef }),
]);
const changeRecord = z.object({ change, basis, sources, why });
const draftRecord = changeRecord.extend({ scene: z.number().int().describe("Scene ordinal in this session.") });
const scenes = z
  .array(z.object({ title: z.string(), start: z.string().describe('Timestamp like "0:14:02".'), end: z.string().optional(), place: z.string(), summary: z.string().describe("Plot points only, one or two lines.") }))
  .min(1);
const frameFields = z.object(Object.fromEntries(FRAME_FIELDS.map((f) => [f, z.string().optional()]))).describe("Only the frame fields to change; the rest stay as they are.");
const schemaOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_property"), kind: z.string(), key: z.string(), type: z.enum(["text", "enum", "number"]), enumValues: z.array(z.string()).optional(), description: z.string() }),
  z.object({ op: z.literal("retire_property"), kind: z.string(), key: z.string() }),
  z.object({ op: z.literal("add_relationship_type"), type: z.string(), label: z.string(), inverseLabel: z.string(), from: z.array(z.string()), to: z.array(z.string()), description: z.string() }),
]);
const session = z.string().describe('Session id like "s3", or its number.');

function uploadResult({ store, upload }: Ctx, sessionRef: string) {
  const s = store.session(sessionRef);
  if (upload.mode === "page")
    return {
      uploadPage: upload.urlFor(s.id),
      howTo: "Give this link to the GM. They sign in and drop the transcript file there. Then continue.",
    };
  return {
    uploadUrl: upload.urlFor(s.id),
    method: "PUT",
    expiresInSeconds: 600,
    howTo: `Send the file bytes straight from disk, e.g. curl -sS -T <file> '${upload.urlFor(s.id)}'. Never paste the transcript into a tool call.`,
  };
}

const tool = (name: string, description: string, schema: z.ZodObject, run: Tool["run"], write = false): Tool => ({ name, description, schema, run, write });

// ---------- A: few deep tools ----------

const surfaceA: Tool[] = [
  tool(
    "story_read",
    [
      "Read the story state. Pick one view:",
      "overview: adventures and sessions in order, with transcript, scenes, and debrief status. Start here.",
      "schema: kinds, allowed properties, relationship types, and bases. Read it before drafting.",
      "entities: find entities by kind and/or nameContains. Use it to avoid duplicates.",
      "entity: one entity by entityId; withHistory adds every past change with its sources.",
      "transcript: a stored session transcript by sessionId, optionally from/to timestamps or lines that contain a word.",
      "frame: the current adventure frame.",
    ].join("\n"),
    z.object({
      view: z.enum(["overview", "schema", "entities", "entity", "transcript", "frame"]),
      kind: z.string().optional(),
      nameContains: z.string().optional(),
      entityId: z.string().optional(),
      withHistory: z.boolean().optional(),
      sessionId: session.optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      contains: z.string().optional(),
    }),
    (a, { store }) => {
      switch (a.view) {
        case "overview":
          return store.overview();
        case "schema":
          return store.describeSchema();
        case "entities":
          return store.listEntities(a.kind, a.nameContains);
        case "entity":
          return store.entityView(store.entity(a.entityId ?? reject('view "entity" needs entityId.')), a.withHistory);
        case "transcript":
          return store.transcript(a.sessionId ?? reject('view "transcript" needs sessionId.'), a.from, a.to, a.contains);
        case "frame":
          return store.get("frame");
      }
    },
  ),
  tool(
    "debrief",
    [
      "Work on one session: record it, upload its transcript, split it into scenes, and draft its story-state changes. Every draft action returns the draft.",
      "new_session: record a played session (playedOn) in the current adventure.",
      "upload_url: get where to upload the session's transcript file.",
      "set_scenes: store the session's scenes (title, start, place, summary).",
      "open: start the draft (optional summary). propose: add changes; each has scene, change, basis, sources, and why; invalid changes are rejected one by one with the reason.",
      "drop: remove changes by changeIds. show: show the draft. commit: apply the draft as one commit, only when the GM says it is right.",
    ].join("\n"),
    z.object({
      action: z.enum(["new_session", "upload_url", "set_scenes", "open", "propose", "drop", "show", "commit"]),
      sessionId: session.optional(),
      playedOn: z.string().optional().describe("YYYY-MM-DD, for new_session."),
      scenes: scenes.optional(),
      summary: z.string().optional(),
      changes: z.array(draftRecord).optional(),
      changeIds: z.array(z.string()).optional(),
    }),
    (a, ctx) => {
      const { store } = ctx;
      const sid = () => a.sessionId ?? reject(`action "${a.action}" needs sessionId.`);
      switch (a.action) {
        case "new_session":
          return store.createSession(a.playedOn ?? reject('action "new_session" needs playedOn.'));
        case "upload_url":
          return uploadResult(ctx, sid());
        case "set_scenes":
          return { scenes: store.setScenes(sid(), a.scenes ?? reject('action "set_scenes" needs scenes.')).scenes };
        case "open":
          store.openDebrief(sid(), a.summary);
          return { draft: store.showDraft(sid()) };
        case "propose":
          return { results: store.addToDraft(sid(), a.changes ?? []), draft: store.showDraft(sid()) };
        case "drop":
          return { ...store.dropFromDraft(sid(), a.changeIds ?? []), draft: store.showDraft(sid()) };
        case "show":
          return { draft: store.showDraft(sid()) };
        case "commit":
          return store.commitDebrief(sid());
      }
    },
    true,
  ),
  tool(
    "adventure",
    "The adventure frame: the GM's intent for the current adventure (goal, stakes, timeframe, pressure, finale, moves_main_plot, pulls_in, next_session_starts). show reads it; update changes only the given fields, with the GM's reason. The frame is intent, never story state.",
    z.object({ action: z.enum(["show", "update"]), fields: frameFields.optional(), reason: z.string().optional() }),
    (a, { store }) => (a.action === "show" ? store.get("frame") : store.updateFrame(a.reason ?? "", a.fields ?? reject('action "update" needs fields.'))),
    true,
  ),
  tool(
    "story_correct",
    "Change the committed story state outside a debrief, as one small commit with the GM's reason: a fix to a committed mistake, or the GM's answer to a background question (basis game_master). All changes apply, or none.",
    z.object({ reason: z.string(), changes: z.array(changeRecord).min(1) }),
    (a, { store }) => store.commitChanges(a.reason, a.changes),
    true,
  ),
  tool(
    "schema_change",
    "Deliberately change the story-state schema: add or retire a property, or add a relationship type. Only when the GM explicitly asks, never during a debrief.",
    z.object({ reason: z.string(), ops: z.array(schemaOp).min(1) }),
    (a, { store }) => store.changeSchema(a.reason, a.ops),
    true,
  ),
];

// ---------- B: many narrow verbs ----------

const draftBase = { sessionId: session, scene: z.number().int().describe("Scene ordinal."), basis, sources, why };
const asRecord = (a: any, c: unknown) => ({ scene: a.scene, change: c, basis: a.basis, sources: a.sources, why: a.why });

const surfaceB: Tool[] = [
  tool("list_sessions", "List adventures and sessions with transcript, scene, and debrief status.", z.object({}), (_a, { store }) => store.overview()),
  tool("get_schema", "Get the kinds, allowed properties, relationship types, and bases.", z.object({}), (_a, { store }) => store.describeSchema()),
  tool("list_entities", "List entities, optionally by kind and/or name substring.", z.object({ kind: z.string().optional(), nameContains: z.string().optional() }), (a, { store }) => store.listEntities(a.kind, a.nameContains)),
  tool("get_entity", "Get one entity's properties and relationships.", z.object({ entityId: z.string() }), (a, { store }) => store.entityView(store.entity(a.entityId))),
  tool("get_entity_history", "Get every committed change to one entity, with basis, sources, and why.", z.object({ entityId: z.string() }), (a, { store }) => store.historyOf(store.entity(a.entityId).id)),
  tool("read_transcript", "Read a stored session transcript, optionally between two timestamps.", z.object({ sessionId: session, from: z.string().optional(), to: z.string().optional() }), (a, { store }) => store.transcript(a.sessionId, a.from, a.to)),
  tool(
    "search_transcripts",
    "Find transcript lines containing a word or phrase, in one session or all.",
    z.object({ text: z.string(), sessionId: session.optional() }),
    (a, { store }) =>
      (a.sessionId ? [store.session(a.sessionId)] : store.state.sessions.filter((s) => s.transcript)).map((s) => ({ session: s.ordinal, ...store.transcript(s.id, undefined, undefined, a.text) })),
  ),
  tool("get_frame", "Get the current adventure frame.", z.object({}), (_a, { store }) => store.get("frame")),
  tool("create_session", "Record a played session in the current adventure.", z.object({ playedOn: z.string().describe("YYYY-MM-DD") }), (a, { store }) => store.createSession(a.playedOn), true),
  tool("get_upload_url", "Get where to upload a session's transcript file.", z.object({ sessionId: session }), (a, ctx) => uploadResult(ctx, a.sessionId), true),
  tool("set_scenes", "Store a session's scenes.", z.object({ sessionId: session, scenes }), (a, { store }) => ({ scenes: store.setScenes(a.sessionId, a.scenes).scenes }), true),
  tool(
    "draft_new_entity",
    "Add one new entity to a session's debrief draft.",
    z.object({ ...draftBase, kind: z.string(), name: z.string(), tempKey: z.string().optional(), aliases: z.array(z.string()).optional(), properties: properties.optional() }),
    (a, { store }) => store.addToDraft(a.sessionId, [asRecord(a, { op: "new", kind: a.kind, name: a.name, tempKey: a.tempKey, aliases: a.aliases, properties: a.properties })])[0],
    true,
  ),
  tool(
    "draft_update_entity",
    "Add one update of an existing entity to a session's debrief draft.",
    z.object({ ...draftBase, entity: entityRef, properties: properties.optional(), addAliases: z.array(z.string()).optional() }),
    (a, { store }) => store.addToDraft(a.sessionId, [asRecord(a, { op: "update", entity: a.entity, properties: a.properties, addAliases: a.addAliases })])[0],
    true,
  ),
  tool(
    "draft_relate",
    "Add one new relationship to a session's debrief draft.",
    z.object({ ...draftBase, type: z.string(), from: entityRef, to: entityRef }),
    (a, { store }) => store.addToDraft(a.sessionId, [asRecord(a, { op: "relate", type: a.type, from: a.from, to: a.to })])[0],
    true,
  ),
  tool(
    "draft_unrelate",
    "Add the removal of one relationship to a session's debrief draft.",
    z.object({ ...draftBase, type: z.string(), from: entityRef, to: entityRef }),
    (a, { store }) => store.addToDraft(a.sessionId, [asRecord(a, { op: "unrelate", type: a.type, from: a.from, to: a.to })])[0],
    true,
  ),
  tool("draft_drop", "Remove changes from a session's debrief draft.", z.object({ sessionId: session, changeIds: z.array(z.string()) }), (a, { store }) => store.dropFromDraft(a.sessionId, a.changeIds), true),
  tool("draft_show", "Show a session's debrief draft.", z.object({ sessionId: session }), (a, { store }) => store.showDraft(a.sessionId)),
  tool("draft_commit", "Commit a session's debrief draft. Only when the GM says it is right.", z.object({ sessionId: session }), (a, { store }) => store.commitDebrief(a.sessionId), true),
  tool("update_frame", "Change fields of the current adventure frame, with the GM's reason.", z.object({ reason: z.string(), fields: frameFields }), (a, { store }) => store.updateFrame(a.reason, a.fields), true),
  tool("correct_story", "Commit changes outside a debrief with the GM's reason (a fix, or a GM answer). All or nothing.", z.object({ reason: z.string(), changes: z.array(changeRecord).min(1) }), (a, { store }) => store.commitChanges(a.reason, a.changes), true),
  tool("change_schema", "Change the schema. Only when the GM explicitly asks.", z.object({ reason: z.string(), ops: z.array(schemaOp).min(1) }), (a, { store }) => store.changeSchema(a.reason, a.ops), true),
];

// ---------- C and D: narrow writes, generic find/get ----------

const findTool = tool(
  "find",
  [
    "Search the whole store: entities (names, aliases, properties), change sources, scene summaries, and transcripts.",
    "Returns ranked hits, each with a ref to pass to get. Use it first for any prep question or before creating an entity.",
  ].join("\n"),
  z.object({
    query: z.string().describe("Words to look for, e.g. 'Saltmere mine'."),
    types: z.array(z.enum(["entity", "source", "scene", "transcript"])).optional(),
    kinds: z.array(z.string()).optional().describe("Limit entity hits to these kinds."),
    limit: z.number().int().max(30).optional(),
  }),
  (a, { store }) => store.find(a.query, a.types, a.kinds, a.limit),
);

const getTool = tool(
  "get",
  [
    "Read one thing by ref:",
    "overview | schema | frame | entity:<id> (with history) | session:<id> | scene:<session>/<n> (with its transcript) | transcript:<session>[@<timestamp>] | debrief:<session> (the draft).",
  ].join("\n"),
  z.object({ ref: z.string() }),
  (a, { store }) => store.get(a.ref),
);

const writesCD: Tool[] = [
  tool("session_create", "Record a played session in the current adventure.", z.object({ playedOn: z.string().describe("YYYY-MM-DD") }), (a, { store }) => store.createSession(a.playedOn), true),
  tool("transcript_upload_url", "Get where to upload a session's transcript file. The file goes from disk to the URL, never through a tool call.", z.object({ session }), (a, ctx) => uploadResult(ctx, a.session), true),
  tool("scenes_set", "Store a session's scenes, replacing any earlier split.", z.object({ session, scenes }), (a, { store }) => ({ scenes: store.setScenes(a.session, a.scenes).scenes }), true),
  tool(
    "debrief_add",
    "Add changes to a session's debrief draft (opens it if needed). Each change has scene, change (new/update/relate/unrelate), basis, sources, and why. Invalid changes are rejected one by one with the reason; the others are kept.",
    z.object({ session, changes: z.array(draftRecord).min(1) }),
    (a, { store }) => ({ results: store.addToDraft(a.session, a.changes) }),
    true,
  ),
  tool("debrief_drop", "Remove changes from a session's debrief draft by changeId.", z.object({ session, changeIds: z.array(z.string()).min(1) }), (a, { store }) => store.dropFromDraft(a.session, a.changeIds), true),
  tool("debrief_commit", "Commit a session's debrief draft as one commit. Only after the GM says the draft is right.", z.object({ session }), (a, { store }) => store.commitDebrief(a.session), true),
  tool(
    "story_commit",
    "Commit changes outside a debrief, with the GM's reason: a fix to a committed mistake, or the GM's answer to a background question (basis game_master). All or nothing.",
    z.object({ reason: z.string(), changes: z.array(changeRecord).min(1) }),
    (a, { store }) => store.commitChanges(a.reason, a.changes),
    true,
  ),
  tool("frame_update", "Change only the given fields of the current adventure frame, with the GM's reason. The frame is intent, never story state.", z.object({ reason: z.string(), fields: frameFields }), (a, { store }) => store.updateFrame(a.reason, a.fields), true),
  tool("schema_change", "Change the schema. Only when the GM explicitly asks.", z.object({ reason: z.string(), ops: z.array(schemaOp).min(1) }), (a, { store }) => store.changeSchema(a.reason, a.ops), true),
];

const skillTool = tool(
  "skill",
  "The procedures for Omni-GM work. Call without a name to list them; call with a name to load one. Load the matching procedure before you start a workflow (transcript upload and scenes, debrief, frame talk, prep, plank answers).",
  z.object({ name: z.string().optional() }),
  (a) => (a.name ? (PROCEDURES[a.name] ? { name: a.name, procedure: PROCEDURES[a.name]!.body } : reject(`No procedure "${a.name}". Procedures: ${Object.keys(PROCEDURES).join(", ")}.`)) : { procedures: procedureList() }),
);

// ---------- E: C with the contract fixes the matrix pointed at ----------

const findToolE = tool(
  "find",
  [
    "Search the whole store: entities (names, aliases, properties), change sources, scene summaries, and transcripts. Returns ranked hits, each with a ref for get.",
    "With no query it lists instead: all entities (optionally only some kinds) and scenes, with their refs. Use that to see what exists before a debrief.",
  ].join("\n"),
  z.object({
    query: z.string().optional().describe("Words to look for, e.g. 'Saltmere mine'. Omit to list."),
    types: z.array(z.enum(["entity", "source", "scene", "transcript"])).optional(),
    kinds: z.array(z.string()).optional().describe("Limit entity hits to these kinds."),
    limit: z.number().int().max(200).optional().describe("Default 10 for a search, 100 for a list."),
  }),
  (a, { store }) => store.find(a.query ?? "", a.types, a.kinds, a.limit ?? (a.query?.trim() ? 10 : 100), true),
);

const getToolE = tool(
  "get",
  [
    "Read one or more things by ref (pass refs to read several at once):",
    "overview | schema | frame | entity:<id> (with history) | session:<id> | scene:<session>/<n> (with its transcript) | transcript:<session>[@<timestamp>] | debrief:<session> (the draft).",
  ].join("\n"),
  z.object({ ref: z.string().optional(), refs: z.array(z.string()).max(25).optional() }),
  (a, { store }) => (a.refs?.length ? store.getMany(a.refs) : store.get(a.ref ?? reject("Give ref or refs."), true)),
);

const normalizeSkill = (name: string) => {
  const slug = name.toLowerCase().trim().replace(/[\s_]+/g, "-");
  return PROCEDURES[slug] ? slug : Object.keys(PROCEDURES).find((k) => k.startsWith(slug.split("-")[0]!));
};

const skillToolE = tool(
  "skill",
  "The procedures for Omni-GM work, each with the standing rules. Call without a name to list them; call with a name to load one. Load the matching procedure before you start a workflow (transcript upload and scenes, debrief, frame talk, prep, plank answers).",
  z.object({ name: z.string().optional() }),
  (a) => {
    if (!a.name) return { procedures: procedureList() };
    const name = normalizeSkill(a.name) ?? reject(`No procedure "${a.name}". Procedures: ${Object.keys(PROCEDURES).join(", ")}.`);
    return { name, procedure: `${PROCEDURES[name]!.body}\n\n${STANDING_RULES}` };
  },
);

const RULE_HINT = " Basis rule: a player_guess or player_plan only touches a thread or character_goal. Never draft prep.";
const writesE = writesCD.map((t) => (["debrief_add", "story_commit", "frame_update"].includes(t.name) ? { ...t, description: t.description + RULE_HINT } : t));

export function toolsFor(surface: Surface): Tool[] {
  switch (surface) {
    case "A":
      return surfaceA;
    case "B":
      return surfaceB;
    case "C":
      return [findTool, getTool, ...writesCD, skillTool];
    case "D":
      return [findTool, getTool, ...writesCD];
    case "E":
      return [findToolE, getToolE, ...writesE, skillToolE];
  }
}

function reject(message: string): never {
  throw new Rejection(message);
}
