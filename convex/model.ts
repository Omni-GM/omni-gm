import { ConvexError, type Infer, v } from "convex/values";
export const propertyValues = v.record(
  v.string(),
  v.union(v.string(), v.number()),
);
export const kinds: Record<string, Record<string, string | string[]>> = {
  npc: {
    role: "text",
    playedAs: "text",
    wants: "text",
    knows: "text",
    relationships: "text",
    status: ["alive", "dead", "gone", "unknown"],
  },
  player_character: { concept: "text" },
  place: { detailsShown: "text", state: "text" },
  world_fact: { statement: "text" },
  thread: {
    whatIsOpen: "text",
    status: ["open", "advanced", "closed"],
    nextStep: "text",
    deadline: "text",
  },
  character_goal: {
    goal: "text",
    progress: "text",
    status: ["open", "closed"],
  },
  clock: {
    countsToward: "text",
    segments: "number",
    filled: "number",
    visibleToPlayers: ["shown", "hidden"],
  },
};
export const relationshipTypes = {
  last_seen_at: {
    from: ["npc", "player_character"],
    to: ["place"],
    label: "last seen at",
    inverseLabel: "last seen here",
  },
  located_in: {
    from: ["place"],
    to: ["place"],
    label: "located in",
    inverseLabel: "contains",
  },
  raised_by: {
    from: ["thread"],
    to: ["npc", "player_character"],
    label: "raised by",
    inverseLabel: "raised",
  },
  involves: {
    from: ["thread", "world_fact"],
    to: Object.keys(kinds).filter((k) => k !== "clock"),
    label: "involves",
    inverseLabel: "involved in",
  },
  pursues: {
    from: ["player_character"],
    to: ["character_goal"],
    label: "pursues",
    inverseLabel: "pursued by",
  },
  pressures: {
    from: ["clock"],
    to: ["thread", "place", "player_character"],
    label: "pressures",
    inverseLabel: "pressured by",
  },
};
export const change = v.union(
  v.object({
    op: v.literal("new"),
    tempKey: v.optional(v.string()),
    kind: v.string(),
    name: v.string(),
    aliases: v.optional(v.array(v.string())),
    properties: v.optional(propertyValues),
  }),
  v.object({
    op: v.literal("update"),
    entity: v.string(),
    properties: v.optional(propertyValues),
    addAliases: v.optional(v.array(v.string())),
  }),
  v.object({
    op: v.literal("relate"),
    type: v.string(),
    from: v.string(),
    to: v.string(),
  }),
  v.object({
    op: v.literal("unrelate"),
    type: v.string(),
    from: v.string(),
    to: v.string(),
  }),
);
export const basis = v.union(
  v.literal("narrated"),
  v.literal("npc_said"),
  v.literal("rumor"),
  v.literal("player_guess"),
  v.literal("player_plan"),
  v.literal("game_master"),
);
export const proposed = v.object({
  scene: v.number(),
  change,
  basis: v.array(basis),
  sources: v.array(v.object({ quote: v.string(), at: v.optional(v.string()) })),
  why: v.string(),
});
export const draftChange = v.object({ id: v.string(), ...proposed.fields });
export const scene = v.object({
  title: v.string(),
  start: v.string(),
  end: v.optional(v.string()),
  place: v.string(),
  summary: v.string(),
});
export const utterance = v.object({
  at: v.string(),
  seconds: v.number(),
  speaker: v.string(),
  text: v.string(),
});
export const entity = v.object({
  id: v.string(),
  kind: v.string(),
  name: v.string(),
  aliases: v.array(v.string()),
  properties: propertyValues,
});
export const relationship = v.object({
  type: v.string(),
  from: v.string(),
  to: v.string(),
});
export const history = v.object({
  commit: v.string(),
  session: v.string(),
  scene: v.number(),
  change,
  basis: v.array(basis),
  sources: proposed.fields.sources,
  why: v.string(),
  before: v.union(entity, relationship, v.null()),
  after: v.union(entity, relationship, v.null()),
});
export const draft = v.object({
  session: v.string(),
  status: v.union(v.literal("draft"), v.literal("committed")),
  changes: v.array(draftChange),
  lastTime: v.string(),
});
export const frameFields = v.object({
  goal: v.optional(v.string()),
  stakes: v.optional(v.string()),
  timeframe: v.optional(v.string()),
  pressure: v.optional(v.string()),
  finale: v.optional(v.string()),
  moves_main_plot: v.optional(v.string()),
  pulls_in: v.optional(v.string()),
  next_session_starts: v.optional(v.string()),
});
export const frame = v.object({
  adventure: v.string(),
  name: v.string(),
  fields: frameFields,
});
export const frameHistory = v.object({
  id: v.string(),
  kind: v.literal("frame"),
  reason: v.string(),
  before: frameFields,
  after: frameFields,
});
export const frameUpdateResult = v.object({
  commit: v.string(),
  adventure: v.string(),
  fields: frameFields,
});
export const frameRead = v.object({
  ...frame.fields,
  history: v.array(frameHistory),
});
export const ledgerRow = v.object({
  id: v.string(),
  label: v.union(
    v.literal("new"),
    v.literal("change"),
    v.literal("closed"),
    v.literal("link"),
    v.literal("unlink"),
  ),
  subject: v.string(),
  kind: v.optional(v.string()),
  before: propertyValues,
  after: propertyValues,
});
export const ledger = v.object({
  scenes: v.array(
    v.object({ ordinal: v.number(), title: v.string(), place: v.string() }),
  ),
  rows: v.array(ledgerRow),
});
export const adventure = v.object({
  id: v.string(),
  name: v.string(),
  reason: v.string(),
});
export const sessionInfo = v.object({
  id: v.string(),
  adventure: v.string(),
  playedOn: v.string(),
  ordinal: v.number(),
  scenes: v.array(scene),
  status: v.union(v.literal("draft"), v.literal("committed")),
  lastTime: v.string(),
});
export const schemaInfo = v.object({
  retiredProperties: v.record(
    v.string(),
    v.record(v.string(), v.union(v.string(), v.array(v.string()))),
  ),
  kinds: v.record(
    v.string(),
    v.record(v.string(), v.union(v.string(), v.array(v.string()))),
  ),
  relationshipTypes: v.record(
    v.string(),
    v.object({
      from: v.array(v.string()),
      to: v.array(v.string()),
      label: v.string(),
      inverseLabel: v.string(),
    }),
  ),
});
export const schemaOp = v.union(
  v.object({
    op: v.literal("add_property"),
    kind: v.string(),
    key: v.string(),
    type: v.union(v.literal("text"), v.literal("number"), v.literal("enum")),
    enumValues: v.optional(v.array(v.string())),
    description: v.string(),
  }),
  v.object({
    op: v.literal("retire_property"),
    kind: v.string(),
    key: v.string(),
  }),
  v.object({
    op: v.literal("add_relationship_type"),
    type: v.string(),
    label: v.string(),
    inverseLabel: v.string(),
    from: v.array(v.string()),
    to: v.array(v.string()),
    description: v.string(),
  }),
);
export const schemaChangeRecord = v.object({
  ops: v.array(schemaOp),
  before: schemaInfo,
  after: schemaInfo,
});
export const commit = v.object({
  id: v.string(),
  kind: v.union(
    v.literal("seed"),
    v.literal("debrief"),
    v.literal("schema"),
    v.literal("frame"),
  ),
  reason: v.string(),
  schemaChange: v.optional(schemaChangeRecord),
  session: v.optional(v.string()),
});
export const readValue = v.union(
  v.object({
    adventures: v.array(adventure),
    sessions: v.array(sessionInfo),
    commits: v.array(commit),
    currentAdventure: v.union(v.string(), v.null()),
    frame: v.union(frame, v.null()),
    lastTime: v.string(),
  }),
  frameRead,
  schemaInfo,
  sessionInfo,
  draft,
  v.object({
    ...entity.fields,
    relationships: v.array(
      v.object({
        ...relationship.fields,
        label: v.string(),
        inverseLabel: v.string(),
      }),
    ),
    history: v.array(history),
  }),
  v.object({
    session: v.string(),
    ordinal: v.number(),
    ...scene.fields,
    utterances: v.array(utterance),
  }),
  v.object({
    session: v.string(),
    utterances: v.array(utterance),
    downloadUrl: v.string(),
  }),
);
export type SchemaInfo = Infer<typeof schemaInfo>;
export type SchemaOp = Infer<typeof schemaOp>;
export function schemaFor(campaign: { schema?: SchemaInfo }): SchemaInfo {
  return campaign.schema ?? { kinds, relationshipTypes, retiredProperties: {} };
}
export type Proposed = Infer<typeof proposed>;
export type Entity = Infer<typeof entity>;
export type Relationship = Infer<typeof relationship>;
export type DraftChange = Infer<typeof draftChange>;
export type History = Infer<typeof history>;
export type LedgerRow = Infer<typeof ledgerRow>;
export type ReadValue = Infer<typeof readValue>;
export function seconds(at: string): number {
  if (!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(at))
    throw new ConvexError("Use a timestamp like 0:14:02");
  const parts = at.split(":").map(Number);
  if (parts.slice(1).some((p) => p >= 60))
    throw new ConvexError("Invalid timestamp");
  return parts.reduce((sum, p) => sum * 60 + p, 0);
}
