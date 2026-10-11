import {
  type DataModelFromSchemaDefinition,
  defineSchema,
  defineTable,
  type TableDefinition,
} from "convex/server";
import { v } from "convex/values";
import current from "../../convex/schema";

const validator = v.object({
  ...current.tables.uploads.validator.fields,
  appendState: v.optional(
    v.object({
      nextIndex: v.number(),
      bytes: v.number(),
      finalIndex: v.optional(v.number()),
      completed: v.boolean(),
    }),
  ),
});
type Uploads = DataModelFromSchemaDefinition<typeof current>["uploads"];
const uploads = current.tables.uploads as unknown as TableDefinition<
  typeof validator,
  Uploads["indexes"],
  Uploads["searchIndexes"],
  Uploads["vectorIndexes"]
>;
uploads.validator = validator;

export default defineSchema({
  ...current.tables,
  uploads,
  transcriptChunks: defineTable({
    upload: v.id("uploads"),
    index: v.number(),
    text: v.string(),
    final: v.boolean(),
  }).index("by_upload_and_index", ["upload", "index"]),
});
