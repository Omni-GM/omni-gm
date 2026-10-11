import { ConvexError, type Infer, v } from "convex/values";
import type { McpCaller } from "convex-mcp-gateway";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  httpAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { seconds, utterance } from "./model";
import { callerArgs, campaignFor, sessionFor } from "./store";

const MAX_BYTES = 2_000_000;
const MAX_LINES = 2000;
export const uploadArgs = { ...callerArgs, session: v.string() };
export const uploadResult = v.object({ url: v.string(), pageUrl: v.string() });
export function siteUrl(): string {
  return process.env.CONVEX_SITE_URL ?? "https://test.convex.site";
}
async function issueToken(
  ctx: MutationCtx,
  caller: McpCaller,
  session: string,
): Promise<{ token: string; session: Id<"sessions"> }> {
  const campaign = await campaignFor(ctx, caller);
  const s = await sessionFor(ctx, campaign._id, session);
  if (isLocked(s))
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
  return { token, session: s._id };
}
function isLocked(session: Doc<"sessions">): boolean {
  return (
    session.status === "committed" ||
    session.scenes.length > 0 ||
    session.changes.length > 0
  );
}
export const uploadUrl = internalMutation({
  args: uploadArgs,
  returns: uploadResult,
  handler: async (
    ctx,
    { caller, session },
  ): Promise<Infer<typeof uploadResult>> => {
    const issued = await issueToken(ctx, caller, session);
    return {
      url: `${siteUrl()}/upload?token=${issued.token}`,
      pageUrl: `${siteUrl()}/upload-page?session=${issued.session}`,
    };
  },
});
export const expire = internalMutation({
  args: { ticket: v.id("uploads") },
  returns: v.null(),
  handler: async (ctx, { ticket }) => {
    if (await ctx.db.get(ticket)) await ctx.db.delete(ticket);
    return null;
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
      throw new ConvexError({
        code: "UPLOAD_CAPABILITY",
        message: "Upload URL expired or used",
      });
    const session = await ctx.db.get(ticket.session);
    if (!session || isLocked(session))
      throw new ConvexError({
        code: "UPLOAD_CAPABILITY",
        message: "Transcript is locked",
      });
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
const refusedUrl = { status: 403, message: "Expired, used or locked URL" };
const lockedTranscript = {
  status: 409,
  message: "Transcript is locked once scenes or a debrief exist",
};
async function store(
  ctx: ActionCtx,
  token: string,
  request: Request,
  refused: { status: number; message: string },
): Promise<Response> {
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
  } catch (error) {
    await ctx.storage.delete(storage);
    const capability =
      error instanceof ConvexError &&
      typeof error.data === "object" &&
      error.data !== null &&
      "code" in error.data &&
      error.data.code === "UPLOAD_CAPABILITY";
    if (capability)
      return new Response(refused.message, { status: refused.status });
    return new Response("Upload failed; retry the same URL", { status: 500 });
  }
  return Response.json({ uploaded: true });
}
export const upload = httpAction(async (ctx, request) => {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!(await ctx.runQuery(internal.uploads.valid, { token })))
    return new Response("Expired or used URL", { status: 403 });
  return store(ctx, token, request, refusedUrl);
});
const pageSessionResult = v.union(
  v.null(),
  v.object({
    ordinal: v.number(),
    playedOn: v.string(),
    locked: v.boolean(),
    uploaded: v.boolean(),
  }),
);
export const pageSession = internalQuery({
  args: uploadArgs,
  returns: pageSessionResult,
  handler: async (
    ctx,
    { caller, session },
  ): Promise<Infer<typeof pageSessionResult>> => {
    try {
      const campaign = await campaignFor(ctx, caller);
      const s = await sessionFor(ctx, campaign._id, session);
      return {
        ordinal: s.ordinal,
        playedOn: s.playedOn,
        locked: isLocked(s),
        uploaded: s.transcript !== undefined,
      };
    } catch (error) {
      if (error instanceof ConvexError) return null;
      throw error;
    }
  },
});
export const pageToken = internalMutation({
  args: uploadArgs,
  returns: v.string(),
  handler: async (ctx, { caller, session }) =>
    (await issueToken(ctx, caller, session)).token,
});
export const pageSessionApi = httpAction(async (ctx, request) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return new Response("Sign in first", { status: 401 });
  const args = {
    caller: { subject: identity.subject },
    session: new URL(request.url).searchParams.get("session") ?? "",
  };
  const info = await ctx.runQuery(internal.uploads.pageSession, args);
  if (!info) return new Response("Session not found", { status: 404 });
  if (request.method === "GET") return Response.json(info);
  const locked = () =>
    new Response(lockedTranscript.message, { status: lockedTranscript.status });
  if (info.locked) return locked();
  let token: string;
  try {
    token = await ctx.runMutation(internal.uploads.pageToken, args);
  } catch (error) {
    if (error instanceof ConvexError) return locked();
    throw error;
  }
  return store(ctx, token, request, lockedTranscript);
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
