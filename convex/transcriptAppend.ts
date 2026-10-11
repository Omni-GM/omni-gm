import { ConvexError, type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { callerArgs, campaignFor, sessionFor } from "./store";
import { isLocked, MAX_BYTES, storeBytes } from "./uploads";

export const appendArgs = {
  ...callerArgs,
  session: v.string(),
  chunk: v.string(),
  index: v.number(),
  final: v.boolean(),
  restart: v.optional(v.boolean()),
};
export const appendResult = v.object({
  uploaded: v.boolean(),
  nextIndex: v.number(),
  bytes: v.number(),
});

export const receive = internalMutation({
  args: appendArgs,
  returns: v.object({ token: v.string(), ...appendResult.fields }),
  handler: async (ctx, { caller, session, chunk, index, final, restart }) => {
    const campaign = await campaignFor(ctx, caller);
    const s = await sessionFor(ctx, campaign._id, session);
    if (isLocked(s))
      throw new ConvexError(
        "Transcript is locked once scenes or a debrief exist",
      );
    if (!Number.isInteger(index) || index < 0 || index >= 128)
      throw new ConvexError(
        "Chunk index must be an integer from 0 to 127; restart with larger chunks, up to 64000 UTF-8 bytes, if you need more than 128 chunks",
      );
    if (
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
        chunk,
      )
    )
      throw new ConvexError("Do not split Unicode characters across chunks");
    const bytes = new TextEncoder().encode(chunk).length;
    if (!bytes || bytes > 64_000)
      throw new ConvexError("Send 1 to 64000 UTF-8 bytes per chunk");
    let ticket = await ctx.db
      .query("uploads")
      .withIndex("by_session", (q) => q.eq("session", s._id))
      .filter((q) => q.neq(q.field("appendState"), undefined))
      .unique();
    if (restart) {
      if (index !== 0) throw new ConvexError("Restart must begin at index 0");
      if (ticket) {
        if (ticket.storage && !ticket.appendState?.completed)
          await ctx.scheduler.runAfter(0, internal.uploads.cleanup, {
            session: s._id,
            storage: ticket.storage,
            generation: ticket.storage,
          });
        const upload = ticket._id;
        const chunks = await ctx.db
          .query("transcriptChunks")
          .withIndex("by_upload_and_index", (q) => q.eq("upload", upload))
          .take(128);
        for (const row of chunks) await ctx.db.delete(row._id);
        await ctx.db.delete(ticket._id);
        ticket = null;
      }
    }
    if (!ticket) {
      if (index !== 0) throw new ConvexError("Missing chunk; start at index 0");
      const id = await ctx.db.insert("uploads", {
        session: s._id,
        token: crypto.randomUUID(),
        expires: Date.now() + 60 * 60_000,
        appendState: { nextIndex: 0, bytes: 0, completed: false },
      });
      await ctx.scheduler.runAfter(60 * 60_000, internal.uploads.expire, {
        ticket: id,
      });
      ticket = await ctx.db.get(id);
    }
    if (!ticket?.appendState) throw new ConvexError("Upload not found");
    const state = ticket.appendState;
    if (state.completed && ticket.storage !== s.transcript)
      throw new ConvexError(
        "This upload was replaced; restart at index 0 to upload again",
      );
    if (index < state.nextIndex) {
      const previous = await ctx.db
        .query("transcriptChunks")
        .withIndex("by_upload_and_index", (q) =>
          q.eq("upload", ticket._id).eq("index", index),
        )
        .unique();
      if (!previous || previous.text !== chunk || previous.final !== final)
        throw new ConvexError(
          "Chunk already received with different content or final flag; send restart: true with index 0 to replace it",
        );
      if (!state.completed && ticket.expires <= Date.now())
        throw new ConvexError("Chunk upload expired; restart at index 0");
      if (ticket.storage && !state.completed)
        throw new ConvexError(
          "Upload in progress; wait and retry the final chunk, or send restart: true with index 0 to cancel it",
        );
      return {
        token: ticket.token,
        uploaded: state.completed,
        nextIndex: state.nextIndex,
        bytes: state.bytes,
      };
    }
    if (ticket.expires <= Date.now())
      throw new ConvexError("Chunk upload expired; restart at index 0");
    if (state.finalIndex !== undefined)
      throw new ConvexError(
        "Final chunk already received; retry it or restart the upload",
      );
    if (index !== state.nextIndex)
      throw new ConvexError(
        `Missing or out-of-order chunk; send index ${state.nextIndex}`,
      );
    if (state.bytes + bytes > MAX_BYTES)
      throw new ConvexError("Transcript too large; at most 8 MB");
    await ctx.db.insert("transcriptChunks", {
      upload: ticket._id,
      index,
      text: chunk,
      final,
    });
    const next = {
      ...state,
      nextIndex: index + 1,
      bytes: state.bytes + bytes,
      ...(final ? { finalIndex: index } : {}),
    };
    await ctx.db.patch(ticket._id, { appendState: next });
    return {
      token: ticket.token,
      uploaded: false,
      nextIndex: next.nextIndex,
      bytes: next.bytes,
    };
  },
});

export const assembled = internalQuery({
  args: { token: v.string() },
  returns: v.string(),
  handler: async (ctx, { token }) => {
    const ticket = await ctx.db
      .query("uploads")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!ticket?.appendState || ticket.appendState.finalIndex === undefined)
      throw new ConvexError("Upload is incomplete");
    const chunks = await ctx.db
      .query("transcriptChunks")
      .withIndex("by_upload_and_index", (q) => q.eq("upload", ticket._id))
      .take(128);
    return chunks.map((c) => c.text).join("");
  },
});

export const append = internalAction({
  args: appendArgs,
  returns: appendResult,
  handler: async (ctx, args): Promise<Infer<typeof appendResult>> => {
    const { token, ...result } = await ctx.runMutation(
      internal.transcriptAppend.receive,
      args,
    );
    if (!args.final || result.uploaded) return result;
    const text = await ctx.runQuery(internal.transcriptAppend.assembled, {
      token,
    });
    const response = await storeBytes(
      ctx,
      token,
      new TextEncoder().encode(text),
      {
        status: 409,
        message:
          "Upload in progress or transcript locked; retry the final chunk, or restart at index 0 to cancel an incomplete upload and resend all chunks",
      },
      "Upload failed; retry the identical final chunk, or restart at index 0 to resend all chunks",
    );
    if (!response.ok) throw new ConvexError(await response.text());
    return { ...result, uploaded: true };
  },
});
