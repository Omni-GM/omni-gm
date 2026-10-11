import {
  type DataModelFromSchemaDefinition,
  internalMutationGeneric,
  type MutationBuilder,
  makeFunctionReference,
} from "convex/server";
import { v } from "convex/values";
import type schema from "./schema";

const internalMutation = internalMutationGeneric as MutationBuilder<
  DataModelFromSchemaDefinition<typeof schema>,
  "internal"
>;

export const clear = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    cursor: v.union(v.string(), v.null()),
    done: v.boolean(),
    chunks: v.number(),
    tickets: v.number(),
  }),
  handler: async (ctx, { cursor }) => {
    const chunks = await ctx.db.query("transcriptChunks").take(100);
    for (const chunk of chunks) await ctx.db.delete(chunk._id);
    if (chunks.length)
      return { cursor, done: false, chunks: chunks.length, tickets: 0 };
    const page = await ctx.db
      .query("uploads")
      .paginate({ cursor, numItems: 100 });
    let tickets = 0;
    for (const ticket of page.page) {
      if (!ticket.appendState) continue;
      const session = await ctx.db.get(ticket.session);
      if (ticket.storage && ticket.storage !== session?.transcript)
        await ctx.scheduler.runAfter(
          0,
          makeFunctionReference<"mutation">("uploads:cleanup"),
          {
            session: ticket.session,
            storage: ticket.storage,
            generation: ticket.storage,
          },
        );
      await ctx.db.delete(ticket._id);
      tickets++;
    }
    return {
      cursor: page.isDone ? null : page.continueCursor,
      done: page.isDone,
      chunks: 0,
      tickets,
    };
  },
});
