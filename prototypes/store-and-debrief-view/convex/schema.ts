// PROTOTYPE — throwaway. Starter schema for the story-state store (ticket #8).
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const valueType = v.union(
  v.literal("text"),
  v.literal("enum"),
  v.literal("number"),
);

export const transcriptRef = v.object({
  line: v.number(),
  quote: v.string(),
});

export const changeOp = v.union(
  v.object({
    op: v.literal("create_entity"),
    tempKey: v.string(),
    kind: v.string(),
    name: v.string(),
    properties: v.record(v.string(), v.any()),
  }),
  v.object({
    op: v.literal("set_property"),
    entity: v.string(),
    key: v.string(),
    value: v.any(),
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

export default defineSchema({
  campaigns: defineTable({
    ownerId: v.string(),
    name: v.string(),
  }).index("by_owner", ["ownerId"]),

  adventures: defineTable({
    campaignId: v.id("campaigns"),
    name: v.string(),
    ordinal: v.number(),
  }).index("by_campaign", ["campaignId", "ordinal"]),

  sessions: defineTable({
    campaignId: v.id("campaigns"),
    adventureId: v.id("adventures"),
    ordinal: v.number(),
    playedOn: v.string(),
  }).index("by_campaign", ["campaignId", "ordinal"]),

  scenes: defineTable({
    sessionId: v.id("sessions"),
    ordinal: v.number(),
    title: v.string(),
    summary: v.string(),
  }).index("by_session", ["sessionId", "ordinal"]),

  kindDefinitions: defineTable({
    campaignId: v.id("campaigns"),
    kind: v.string(),
    label: v.string(),
    description: v.string(),
  }).index("by_campaign", ["campaignId", "kind"]),

  propertyDefinitions: defineTable({
    campaignId: v.id("campaigns"),
    kind: v.string(),
    key: v.string(),
    valueType,
    enumValues: v.optional(v.array(v.string())),
    description: v.string(),
    retired: v.boolean(),
  }).index("by_campaign_kind", ["campaignId", "kind", "key"]),

  relationshipDefinitions: defineTable({
    campaignId: v.id("campaigns"),
    type: v.string(),
    label: v.string(),
    inverseLabel: v.string(),
    fromKinds: v.array(v.string()),
    toKinds: v.array(v.string()),
    description: v.string(),
    retired: v.boolean(),
  }).index("by_campaign_type", ["campaignId", "type"]),

  entities: defineTable({
    campaignId: v.id("campaigns"),
    kind: v.string(),
    name: v.string(),
    properties: v.record(v.string(), v.any()),
  })
    .index("by_campaign_kind", ["campaignId", "kind"])
    .index("by_campaign_name", ["campaignId", "name"]),

  relationships: defineTable({
    campaignId: v.id("campaigns"),
    type: v.string(),
    fromId: v.id("entities"),
    toId: v.id("entities"),
  })
    .index("by_from", ["fromId"])
    .index("by_to", ["toId"]),

  debriefs: defineTable({
    sessionId: v.id("sessions"),
    status: v.union(v.literal("draft"), v.literal("committed")),
    summary: v.string(),
    shortSummary: v.string(),
    commitId: v.optional(v.id("commits")),
  }).index("by_session", ["sessionId"]),

  draftChanges: defineTable({
    debriefId: v.id("debriefs"),
    sceneId: v.id("scenes"),
    position: v.number(),
    change: changeOp,
    transcript: transcriptRef,
    why: v.string(),
  }).index("by_debrief", ["debriefId", "position"]),

  commits: defineTable({
    campaignId: v.id("campaigns"),
    kind: v.union(
      v.literal("debrief"),
      v.literal("correction"),
      v.literal("schema"),
      v.literal("seed"),
    ),
    reason: v.string(),
    debriefId: v.optional(v.id("debriefs")),
    committedAt: v.number(),
  }).index("by_campaign", ["campaignId"]),

  history: defineTable({
    campaignId: v.id("campaigns"),
    commitId: v.id("commits"),
    entityId: v.optional(v.id("entities")),
    sceneId: v.optional(v.id("scenes")),
    change: v.any(),
    before: v.optional(v.any()),
    transcript: v.optional(transcriptRef),
    why: v.string(),
  })
    .index("by_entity", ["entityId"])
    .index("by_commit", ["commitId"]),
});
