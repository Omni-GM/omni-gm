import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  commit,
  draftChange,
  entity,
  frameFields,
  history,
  relationship,
  scene,
  schemaInfo,
} from "./model";
export default defineSchema({
  campaigns: defineTable({
    owner: v.string(),
    schema: v.optional(schemaInfo),
    currentAdventure: v.optional(v.id("adventures")),
  }).index("by_owner", ["owner"]),
  adventures: defineTable({
    campaign: v.id("campaigns"),
    name: v.string(),
    reason: v.string(),
    frame: v.optional(frameFields),
  }).index("by_campaign", ["campaign"]),
  sessions: defineTable({
    campaign: v.id("campaigns"),
    adventure: v.id("adventures"),
    playedOn: v.string(),
    ordinal: v.number(),
    scenes: v.array(scene),
    status: v.union(v.literal("draft"), v.literal("committed")),
    lastTime: v.string(),
    changes: v.array(draftChange),
    nextChange: v.number(),
    transcript: v.optional(v.id("_storage")),
  })
    .index("by_campaign", ["campaign"])
    .index("by_campaign_and_ordinal", ["campaign", "ordinal"]),
  entities: defineTable({
    campaign: v.id("campaigns"),
    ...entity.fields,
    searchText: v.string(),
  })
    .index("by_campaign", ["campaign"])
    .index("by_campaign_and_id", ["campaign", "id"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["campaign", "kind"],
    }),
  relationships: defineTable({
    campaign: v.id("campaigns"),
    ...relationship.fields,
  })
    .index("by_campaign", ["campaign"])
    .index("by_campaign_and_from", ["campaign", "from"])
    .index("by_campaign_and_to", ["campaign", "to"]),
  commits: defineTable({
    campaign: v.id("campaigns"),
    kind: commit.fields.kind,
    reason: v.string(),
    session: v.optional(v.string()),
    schemaChange: commit.fields.schemaChange,
    adventure: v.optional(v.id("adventures")),
    before: v.optional(frameFields),
    after: v.optional(frameFields),
  })
    .index("by_campaign", ["campaign"])
    .index("by_campaign_and_adventure", ["campaign", "adventure"])
    .index("by_campaign_and_kind", ["campaign", "kind"]),
  history: defineTable({
    campaign: v.id("campaigns"),
    entityIds: v.array(v.string()),
    ...history.fields,
    searchText: v.string(),
  })
    .index("by_campaign", ["campaign"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["campaign"],
    }),
  entityHistory: defineTable({
    campaign: v.id("campaigns"),
    entityId: v.string(),
    history: v.id("history"),
  }).index("by_campaign_and_entity", ["campaign", "entityId"]),
  uploads: defineTable({
    token: v.string(),
    session: v.id("sessions"),
    expires: v.number(),
  }).index("by_token", ["token"]),
  utterances: defineTable({
    campaign: v.id("campaigns"),
    session: v.id("sessions"),
    at: v.string(),
    seconds: v.number(),
    speaker: v.string(),
    text: v.string(),
    searchText: v.string(),
  })
    .index("by_session_and_seconds", ["session", "seconds"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["campaign"],
    }),
  scenes: defineTable({
    campaign: v.id("campaigns"),
    session: v.id("sessions"),
    ordinal: v.number(),
    ...scene.fields,
    searchText: v.string(),
  })
    .index("by_session", ["session"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["campaign"],
    }),
});
