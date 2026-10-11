import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import current from "../../convex/schema";

export default defineSchema({
  ...current.tables,
  uploads: defineTable({
    ...current.tables.uploads.validator.fields,
    appendState: v.optional(
      v.object({
        nextIndex: v.number(),
        bytes: v.number(),
        finalIndex: v.optional(v.number()),
        completed: v.boolean(),
      }),
    ),
  })
    .index("by_token", ["token"])
    .index("by_session", ["session"]),
  transcriptChunks: defineTable({
    upload: v.id("uploads"),
    index: v.number(),
    text: v.string(),
    final: v.boolean(),
  }).index("by_upload_and_index", ["upload", "index"]),
});
