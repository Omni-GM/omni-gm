import { ConvexError, type Infer, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  type schemaChangeRecord,
  schemaFor,
  schemaInfo,
  schemaOp,
} from "./model";
import { callerArgs, campaignFor } from "./store";

export const schemaChangeArgs = {
  ...callerArgs,
  reason: v.string(),
  ops: v.array(schemaOp),
};
export const schemaChangeResult = v.object({
  commit: v.string(),
  schema: schemaInfo,
});
function validKey(key: string): void {
  if (
    !/^[A-Za-z][A-Za-z0-9_]*$/.test(key) ||
    Object.hasOwn(Object.prototype, key) ||
    ["id", "kind", "name", "aliases", "properties"].includes(key)
  )
    throw new ConvexError(
      "Use a non-reserved identifier starting with a letter",
    );
}
export const changeSchema = internalMutation({
  args: schemaChangeArgs,
  returns: schemaChangeResult,
  handler: async (
    ctx,
    { caller, reason, ops },
  ): Promise<Infer<typeof schemaChangeResult>> => {
    const campaign = await campaignFor(ctx, caller);
    if (!reason.trim() || !ops.length || ops.length > 100)
      throw new ConvexError(
        "A reason and 1 to 100 schema operations are required",
      );
    const before = schemaFor(campaign);
    const after = structuredClone(before);
    for (const op of ops) {
      if (op.op === "add_relationship_type") {
        validKey(op.type);
        if (Object.hasOwn(after.relationshipTypes, op.type))
          throw new ConvexError("Relationship type already exists");
        if (
          !op.type.trim() ||
          !op.label.trim() ||
          !op.inverseLabel.trim() ||
          !op.description.trim()
        )
          throw new ConvexError(
            "A type, both labels and a description are required",
          );
        if (
          !op.from.length ||
          !op.to.length ||
          [...op.from, ...op.to].some(
            (kind) => !Object.hasOwn(after.kinds, kind),
          )
        )
          throw new ConvexError(
            `Allowed endpoint kinds: ${Object.keys(after.kinds).join(", ")}`,
          );
        after.relationshipTypes[op.type] = {
          from: op.from,
          to: op.to,
          label: op.label,
          inverseLabel: op.inverseLabel,
        };
        continue;
      }
      if (!Object.hasOwn(after.kinds, op.kind))
        throw new ConvexError(
          `Allowed kinds: ${Object.keys(after.kinds).join(", ")}`,
        );
      if (op.op === "retire_property") {
        if (!Object.hasOwn(after.kinds[op.kind], op.key))
          throw new ConvexError(
            `Allowed properties for ${op.kind}: ${Object.keys(after.kinds[op.kind]).join(", ")}`,
          );
        after.retiredProperties[op.kind] ??= {};
        after.retiredProperties[op.kind][op.key] = after.kinds[op.kind][op.key];
        delete after.kinds[op.kind][op.key];
        continue;
      }
      validKey(op.key);
      if (Object.hasOwn(after.retiredProperties[op.kind] ?? {}, op.key))
        throw new ConvexError("Property is retired; choose a new key");
      if (Object.hasOwn(after.kinds[op.kind], op.key))
        throw new ConvexError("Property already exists");
      if (!op.description.trim() || !op.key.trim())
        throw new ConvexError("A key and description are required");
      if (op.type === "enum") {
        if (
          !op.enumValues?.length ||
          op.enumValues.some((value) => !value.trim()) ||
          new Set(op.enumValues).size !== op.enumValues.length
        )
          throw new ConvexError("An enum needs distinct, non-empty values");
      } else if (op.enumValues !== undefined)
        throw new ConvexError("Only an enum accepts enumValues");
      after.kinds[op.kind][op.key] =
        op.type === "enum" ? (op.enumValues ?? []) : op.type;
    }
    const schemaChange: Infer<typeof schemaChangeRecord> = {
      ops,
      before,
      after,
    };
    if (
      new TextEncoder().encode(JSON.stringify({ reason, schemaChange }))
        .length > 32_000
    )
      throw new ConvexError(
        "Keep the reason, operations and before/after schema within 32 KB",
      );
    await ctx.db.patch(campaign._id, { schema: after });
    const commit = await ctx.db.insert("commits", {
      campaign: campaign._id,
      kind: "schema",
      reason,
      schemaChange,
    });
    return { commit, schema: after };
  },
});
