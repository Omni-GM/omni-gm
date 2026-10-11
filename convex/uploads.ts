import { ConvexError, type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  httpAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { seconds, utterance } from "./model";
import { callerArgs, campaignFor, sessionFor } from "./store";

const MAX_BYTES = 2_000_000;
const MAX_LINES = 2000;
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
    await ctx.db.insert("uploads", {
      token,
      session: s._id,
      expires: Date.now() + 10 * 60_000,
    });
    return {
      url: `${process.env.CONVEX_SITE_URL ?? "https://test.convex.site"}/upload?token=${token}`,
    };
  },
});
export const finish = internalMutation({
  args: {
    token: v.string(),
    storage: v.id("_storage"),
    utterances: v.array(utterance),
  },
  returns: v.null(),
  handler: async (ctx, { token, storage, utterances }) => {
    const ticket = await ctx.db
      .query("uploads")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!ticket || ticket.expires <= Date.now())
      throw new ConvexError("Upload URL expired or used");
    const session = await ctx.db.get(ticket.session);
    if (
      !session ||
      session.status === "committed" ||
      session.scenes.length ||
      session.changes.length
    )
      throw new ConvexError("Transcript is locked");
    if (session.transcript) await ctx.storage.delete(session.transcript);
    const old = await ctx.db
      .query("utterances")
      .withIndex("by_session_and_seconds", (q) => q.eq("session", session._id))
      .take(MAX_LINES + 1);
    for (const line of old) await ctx.db.delete(line._id);
    for (const line of utterances)
      await ctx.db.insert("utterances", {
        campaign: session.campaign,
        session: session._id,
        ...line,
        searchText: `${line.speaker} ${line.text}`,
      });
    await ctx.db.patch(session._id, { transcript: storage });
    await ctx.db.delete(ticket._id);
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
    return !!ticket && ticket.expires > Date.now();
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
  try {
    await ctx.runMutation(internal.uploads.finish, {
      token,
      storage,
      utterances: lines,
    });
  } catch {
    await ctx.storage.delete(storage);
    return new Response("Expired, used or locked URL", { status: 403 });
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
