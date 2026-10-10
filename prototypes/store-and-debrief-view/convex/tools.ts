// PROTOTYPE — throwaway. The MCP tool surface: names, descriptions that steer the AI, and JSON schemas.
const entityRef = {
  type: "string",
  description: "An existing entity id, or $tempKey of an entity created earlier in the same draft.",
};

const change = {
  description: "One change to the story state.",
  oneOf: [
    {
      type: "object",
      required: ["op", "tempKey", "kind", "name", "properties"],
      properties: {
        op: { const: "create_entity" },
        tempKey: { type: "string", description: "Draft-local key, referenced later as $tempKey." },
        kind: { type: "string" },
        name: { type: "string" },
        properties: { type: "object", description: "Only properties listed by story_schema for this kind." },
      },
    },
    {
      type: "object",
      required: ["op", "entity", "key", "value"],
      properties: { op: { const: "set_property" }, entity: entityRef, key: { type: "string" }, value: {} },
    },
    {
      type: "object",
      required: ["op", "type", "from", "to"],
      properties: { op: { enum: ["relate", "unrelate"] }, type: { type: "string" }, from: entityRef, to: entityRef },
    },
  ],
};

const transcript = {
  type: "object",
  required: ["line", "quote"],
  properties: { line: { type: "number" }, quote: { type: "string", description: "Short verbatim quote, max one sentence." } },
};

export const DEBRIEF_VIEW_URI = "ui://omni-gm/draft-debrief";

export const tools = [
  {
    name: "story_structure",
    description: "The campaign's adventures and sessions, in order, with each session's debrief status. Start here.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "story_schema",
    description:
      "Read the story-state schema: entity kinds, their allowed properties, and relationship types. Call this before drafting a debrief. You cannot invent properties or kinds.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "story_find",
    description: "Find entities by kind and/or part of the name. Returns at most 25 ids and names. Use it to avoid duplicates before create_entity.",
    inputSchema: { type: "object", properties: { kind: { type: "string" }, nameContains: { type: "string" } } },
  },
  {
    name: "story_entity",
    description: "Current state of one entity: its properties and relationships. Set withHistory to also get every past change with scene, transcript line, and why.",
    inputSchema: {
      type: "object",
      required: ["entityId"],
      properties: { entityId: { type: "string" }, withHistory: { type: "boolean" } },
    },
  },
  {
    name: "session_create",
    description: "Record a played session and its scenes, in order. Scenes are the anchors every debrief change attaches to.",
    inputSchema: {
      type: "object",
      required: ["adventureId", "playedOn", "scenes"],
      properties: {
        adventureId: { type: "string" },
        playedOn: { type: "string", description: "YYYY-MM-DD" },
        scenes: {
          type: "array",
          items: { type: "object", required: ["title", "summary"], properties: { title: { type: "string" }, summary: { type: "string" } } },
        },
      },
    },
  },
  {
    name: "debrief_start",
    description:
      "Open (or update) the draft debrief of a session with its session summary and a short version for the GM's session note. One debrief per session.",
    inputSchema: {
      type: "object",
      required: ["sessionId", "summary", "shortSummary"],
      properties: { sessionId: { type: "string" }, summary: { type: "string" }, shortSummary: { type: "string" } },
    },
  },
  {
    name: "debrief_propose",
    description:
      "Add changes to a draft debrief. Each change names its scene (ordinal), the transcript line, and why. Record only what happened at the table, never plans or player guesses. Invalid changes are rejected one by one with a reason; valid ones are kept.",
    inputSchema: {
      type: "object",
      required: ["debriefId", "changes"],
      properties: {
        debriefId: { type: "string" },
        changes: {
          type: "array",
          items: {
            type: "object",
            required: ["scene", "change", "transcript", "why"],
            properties: { scene: { type: "number" }, change, transcript, why: { type: "string" } },
          },
        },
      },
    },
  },
  {
    name: "debrief_drop",
    description: "Remove one change from a draft debrief, when the GM rejects it. To fix a change, drop it and propose the corrected one.",
    inputSchema: { type: "object", required: ["changeId"], properties: { changeId: { type: "string" } } },
  },
  {
    name: "debrief_show",
    description: "Show the draft debrief to the GM, scene by scene, in a view. Call it after proposing and after every round of fixes.",
    inputSchema: { type: "object", required: ["debriefId"], properties: { debriefId: { type: "string" } } },
    _meta: { ui: { resourceUri: DEBRIEF_VIEW_URI } },
  },
  {
    name: "debrief_commit",
    description: "Commit the draft debrief to the story state, all changes at once. Only call this when the GM says the draft is right.",
    inputSchema: { type: "object", required: ["debriefId"], properties: { debriefId: { type: "string" } } },
  },
  {
    name: "story_correct",
    description:
      "Fix the committed story state outside a debrief, as one small commit with a reason the GM gave. All changes apply, or none.",
    inputSchema: {
      type: "object",
      required: ["reason", "changes"],
      properties: {
        reason: { type: "string" },
        changes: {
          type: "array",
          items: { type: "object", required: ["change", "why"], properties: { change, why: { type: "string" } } },
        },
      },
    },
  },
  {
    name: "schema_change",
    description:
      "Deliberately change the story-state schema: add a kind, add or retire a property, or add a relationship type. Only when the GM explicitly asks for it, never as part of a debrief. Recorded in the history with the reason.",
    inputSchema: {
      type: "object",
      required: ["reason", "ops"],
      properties: { reason: { type: "string" }, ops: { type: "array", items: { type: "object" } } },
    },
  },
];
