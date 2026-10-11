import { ConvexError, type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { callerArgs, campaignFor, sessionFor } from "./store";
import { storeTranscript } from "./uploads";

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
    if (s.status === "committed" || s.scenes.length || s.changes.length)
      throw new ConvexError(
        "Transcript is locked once scenes or a debrief exist",
      );
    if (!Number.isInteger(index) || index < 0 || index >= 128)
      throw new ConvexError("Chunk index must be an integer from 0 to 127");
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
      if (ticket?.storage && !ticket.appendState?.completed)
        throw new ConvexError("Upload in progress; retry after it finishes");
      if (ticket) {
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
    if (ticket.expires <= Date.now())
      throw new ConvexError("Chunk upload expired");
    if (index < state.nextIndex) {
      const previous = await ctx.db
        .query("transcriptChunks")
        .withIndex("by_upload_and_index", (q) =>
          q.eq("upload", ticket._id).eq("index", index),
        )
        .unique();
      if (!previous || previous.text !== chunk || previous.final !== final)
        throw new ConvexError(
          "Chunk already received with different content or final flag",
        );
      return {
        token: ticket.token,
        uploaded: state.completed,
        nextIndex: state.nextIndex,
        bytes: state.bytes,
      };
    }
    if (state.finalIndex !== undefined)
      throw new ConvexError(
        "Final chunk already received; retry it or restart the upload",
      );
    if (index !== state.nextIndex)
      throw new ConvexError(
        `Missing or out-of-order chunk; send index ${state.nextIndex}`,
      );
    if (state.bytes + bytes > 8_000_000)
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
    const response = await storeTranscript(
      ctx,
      token,
      new Request("https://test.convex.site/upload", {
        method: "PUT",
        body: text,
      }),
      {
        status: 409,
        message:
          "Upload in progress or transcript locked; retry the final chunk",
      },
    );
    if (!response.ok) throw new ConvexError(await response.text());
    return { ...result, uploaded: true };
  },
});
