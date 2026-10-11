import { ConvexError, type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  httpAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { seconds, utterance } from "./model";
import { callerArgs, campaignFor, sessionFor } from "./store";

const MAX_BYTES = 8_000_000;
const MAX_LINES = 20000;
export const uploadArgs = { ...callerArgs, session: v.string() };
export const uploadResult = v.object({ url: v.string() });
export const uploadUrl = internalMutation({
  args: uploadArgs,
  returns: uploadResult,
  handler: async (
    ctx,
    { caller, session },
  ): Promise<Infer<typeof uploadResult>> => {
    const campaign = await campaignFor(ctx, caller);
    const s = await sessionFor(ctx, campaign._id, session);
    if (s.status === "committed" || s.scenes.length || s.changes.length)
      throw new ConvexError(
        "Transcript is locked once scenes or a debrief exist",
      );
    const token = crypto.randomUUID();
    const ticket = await ctx.db.insert("uploads", {
      token,
      session: s._id,
      expires: Date.now() + 10 * 60_000,
    });
    await ctx.scheduler.runAfter(10 * 60_000, internal.uploads.expire, {
      ticket,
    });
    return {
      url: `${process.env.CONVEX_SITE_URL ?? "https://test.convex.site"}/upload?token=${token}`,
    };
  },
});
function checkUpload(
  ticket: Doc<"uploads"> | null,
  storage?: Id<"_storage">,
): Doc<"uploads"> {
  if (
    !ticket ||
    ticket.expires <= Date.now() ||
    (storage ? ticket.storage !== storage : ticket.storage !== undefined)
  )
    throw new ConvexError({
      code: "UPLOAD_CAPABILITY",
      message: "Upload URL expired or used",
    });
  return ticket;
}
async function ticketFor(
  ctx: MutationCtx,
  token: string,
): Promise<Doc<"uploads"> | null> {
  return ctx.db
    .query("uploads")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
}
function checkSession(session: Doc<"sessions"> | null): Doc<"sessions"> {
  if (
    !session ||
    session.status === "committed" ||
    session.scenes.length ||
    session.changes.length
  )
    throw new ConvexError({
      code: "UPLOAD_CAPABILITY",
      message: "Transcript is locked",
    });
  return session;
}
export const cleanup = internalMutation({
  args: {
    session: v.id("sessions"),
    storage: v.id("_storage"),
    generation: v.union(v.id("_storage"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("utterances")
      .withIndex("by_session_and_generation_and_seconds", (q) =>
        q
          .eq("session", args.session)
          .eq("transcriptGeneration", args.generation ?? undefined),
      )
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 100)
      await ctx.scheduler.runAfter(0, internal.uploads.cleanup, args);
    else await ctx.storage.delete(args.storage);
    return null;
  },
});
export const expire = internalMutation({
  args: { ticket: v.id("uploads") },
  returns: v.null(),
  handler: async (ctx, { ticket }) => {
    const row = await ctx.db.get(ticket);
    if (row) {
      if (row.storage)
        await ctx.scheduler.runAfter(0, internal.uploads.cleanup, {
          session: row.session,
          storage: row.storage,
          generation: row.storage,
        });
      await ctx.db.delete(ticket);
    }
    return null;
  },
});
export const begin = internalMutation({
  args: { token: v.string(), storage: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { token, storage }) => {
    const ticket = checkUpload(await ticketFor(ctx, token));
    checkSession(await ctx.db.get(ticket.session));
    await ctx.db.patch(ticket._id, { storage, count: 0 });
    return null;
  },
});
export const append = internalMutation({
  args: {
    token: v.string(),
    storage: v.id("_storage"),
    start: v.number(),
    utterances: v.array(utterance),
  },
  returns: v.null(),
  handler: async (ctx, { token, storage, start, utterances }) => {
    const ticket = checkUpload(await ticketFor(ctx, token), storage);
    const session = checkSession(await ctx.db.get(ticket.session));
    if (
      start !== ticket.count ||
      !utterances.length ||
      utterances.length > 200 ||
      start + utterances.length > MAX_LINES
    )
      throw new ConvexError("Upload batch is out of order or too large");
    for (const [i, line] of utterances.entries())
      await ctx.db.insert("utterances", {
        campaign: session.campaign,
        session: session._id,
        transcriptGeneration: storage,
        ordinal: start + i,
        ...line,
        searchText: line.speaker + " " + line.text,
      });
    await ctx.db.patch(ticket._id, { count: start + utterances.length });
    return null;
  },
});
export const finish = internalMutation({
  args: { token: v.string(), storage: v.id("_storage"), count: v.number() },
  returns: v.null(),
  handler: async (ctx, { token, storage, count }) => {
    const ticket = checkUpload(await ticketFor(ctx, token), storage);
    const session = checkSession(await ctx.db.get(ticket.session));
    if (count !== ticket.count) throw new ConvexError("Upload is incomplete");
    await ctx.db.patch(session._id, {
      transcript: storage,
      transcriptGeneration: storage,
    });
    await ctx.db.delete(ticket._id);
    if (session.transcript)
      await ctx.scheduler.runAfter(0, internal.uploads.cleanup, {
        session: session._id,
        storage: session.transcript,
        generation: session.transcriptGeneration ?? null,
      });
    return null;
  },
});
export const abort = internalMutation({
  args: { token: v.string(), storage: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { token, storage }) => {
    const ticket = await ticketFor(ctx, token);
    if (ticket?.storage === storage) {
      await ctx.scheduler.runAfter(0, internal.uploads.cleanup, {
        session: ticket.session,
        storage,
        generation: storage,
      });
      await ctx.db.delete(ticket._id);
    }
    return null;
  },
});
export const valid = internalQuery({
  args: { token: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { token }) => {
    const ticket = await ctx.db
      .query("uploads")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    return !!ticket && ticket.expires > Date.now() && !ticket.storage;
  },
});
function parse(text: string): Infer<typeof utterance>[] {
  const result: Infer<typeof utterance>[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^\[?(\d{1,3}:\d{2}(?::\d{2})?)\]?\s+([^:]+):\s*(.*)$/.exec(
      line,
    );
    if (match)
      result.push({
        at: match[1],
        seconds: seconds(match[1]),
        speaker: match[2].trim(),
        text: match[3],
      });
    else if (result.length) result[result.length - 1].text += `\n${line}`;
    else throw new ConvexError("Use [HH:MM:SS] Speaker: text");
  }
  if (!result.length || result.length > MAX_LINES)
    throw new ConvexError(`Use 1 to ${MAX_LINES} utterances`);
  if (
    result.some(
      (line) => new TextEncoder().encode(JSON.stringify(line)).length > 32_000,
    )
  )
    throw new ConvexError(
      "Keep each utterance, including continuations, within 32 KB",
    );
  if (result.some((line, i) => i > 0 && line.seconds < result[i - 1].seconds))
    throw new ConvexError("Transcript timestamps must be in order");
  return result;
}
export const upload = httpAction(async (ctx, request) => {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!(await ctx.runQuery(internal.uploads.valid, { token })))
    return new Response("Expired or used URL", { status: 403 });
  if (Number(request.headers.get("content-length")) > MAX_BYTES)
    return new Response("Transcript too large", { status: 413 });
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > MAX_BYTES)
    return new Response("Transcript too large", { status: 413 });
  let lines: Infer<typeof utterance>[];
  try {
    lines = parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Invalid transcript",
      { status: 400 },
    );
  }
  const storage = await ctx.storage.store(
    new Blob([body], { type: "text/plain;charset=utf-8" }),
  );
  let claimed = false;
  try {
    await ctx.runMutation(internal.uploads.begin, { token, storage });
    claimed = true;
    let start = 0;
    while (start < lines.length) {
      let end = start;
      let bytes = 0;
      while (end < lines.length && end - start < 200) {
        const size = new TextEncoder().encode(
          JSON.stringify(lines[end]),
        ).length;
        if (bytes + size > 250_000) break;
        bytes += size;
        end++;
      }
      await ctx.runMutation(internal.uploads.append, {
        token,
        storage,
        start,
        utterances: lines.slice(start, end),
      });
      start = end;
    }
    await ctx.runMutation(internal.uploads.finish, {
      token,
      storage,
      count: lines.length,
    });
  } catch (error) {
    if (claimed)
      await ctx.runMutation(internal.uploads.abort, { token, storage });
    else await ctx.storage.delete(storage);
    const capability =
      error instanceof ConvexError &&
      typeof error.data === "object" &&
      error.data !== null &&
      "code" in error.data &&
      error.data.code === "UPLOAD_CAPABILITY";
    return new Response(
      capability
        ? "Expired, used or locked URL"
        : "Upload failed; retry the same URL",
      { status: capability ? 403 : 500 },
    );
  }
  return Response.json({ uploaded: true });
});
export const transcriptFile = internalQuery({
  args: { ...callerArgs, session: v.string() },
  returns: v.union(v.id("_storage"), v.null()),
  handler: async (ctx, { caller, session }) => {
    const campaign = await campaignFor(ctx, caller);
    return (await sessionFor(ctx, campaign._id, session)).transcript ?? null;
  },
});
export const download = httpAction(async (ctx, request) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return new Response("Unauthorized", { status: 401 });
  try {
    const storage = await ctx.runQuery(internal.uploads.transcriptFile, {
      caller: { subject: identity.subject },
      session: new URL(request.url).pathname.slice("/transcripts/".length),
    });
    const file = storage ? await ctx.storage.get(storage) : null;
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(file, {
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
});
