import { ConvexError, type Infer, v } from "convex/values";
import { type McpCaller, mcpCallerValidator } from "convex-mcp-gateway";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import {
  adventure,
  type ReadValue,
  readValue,
  schemaFor,
  seconds,
  sessionInfo,
} from "./model";
export const callerArgs = { caller: mcpCallerValidator };
export async function campaignFor(
  ctx: QueryCtx,
  caller: McpCaller,
): Promise<Doc<"campaigns">> {
  const campaign = await ctx.db
    .query("campaigns")
    .withIndex("by_owner", (q) => q.eq("owner", caller.subject))
    .unique();
  if (!campaign)
    throw new ConvexError("No campaign. Call adventure_start first.");
  return campaign;
}
export async function sessionFor(
  ctx: QueryCtx,
  campaign: Id<"campaigns">,
  ref: string,
): Promise<Doc<"sessions">> {
  const sessionRef = ref.replace(/^session:/, "");
  const ordinal = Number(sessionRef.replace(/^s/, ""));
  const id = ctx.db.normalizeId("sessions", sessionRef);
  const session = id
    ? await ctx.db.get(id)
    : await ctx.db
        .query("sessions")
        .withIndex("by_campaign_and_ordinal", (q) =>
          q.eq("campaign", campaign).eq("ordinal", ordinal),
        )
        .unique();
  if (!session || session.campaign !== campaign)
    throw new ConvexError("Session not found");
  return session;
}
export function sessionResult(s: Doc<"sessions">): Infer<typeof sessionInfo> {
  return {
    id: s._id,
    adventure: s.adventure,
    playedOn: s.playedOn,
    ordinal: s.ordinal,
    scenes: s.scenes,
    status: s.status,
    lastTime: s.lastTime,
  };
}
export const adventureArgs = {
  ...callerArgs,
  name: v.string(),
  reason: v.string(),
};
export const adventureStart = internalMutation({
  args: adventureArgs,
  returns: adventure,
  handler: async (
    ctx,
    { caller, name, reason },
  ): Promise<Infer<typeof adventure>> => {
    if (!name.trim() || !reason.trim())
      throw new ConvexError("Name and reason are required");
    let campaign = await ctx.db
      .query("campaigns")
      .withIndex("by_owner", (q) => q.eq("owner", caller.subject))
      .unique();
    if (!campaign) {
      const id = await ctx.db.insert("campaigns", { owner: caller.subject });
      campaign = await ctx.db.get(id);
      if (!campaign) throw new Error("Campaign creation failed");
      await ctx.db.insert("commits", {
        campaign: id,
        kind: "seed",
        reason: "Apply starter schema",
      });
    }
    const id = await ctx.db.insert("adventures", {
      campaign: campaign._id,
      name,
      reason,
    });
    await ctx.db.patch(campaign._id, { currentAdventure: id });
    return { id, name, reason };
  },
});
export const sessionArgs = { ...callerArgs, playedOn: v.string() };
export const sessionCreate = internalMutation({
  args: sessionArgs,
  returns: sessionInfo,
  handler: async (ctx, { caller, playedOn }) => {
    const campaign = await campaignFor(ctx, caller);
    if (!campaign.currentAdventure)
      throw new ConvexError("Call adventure_start first");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(playedOn) ||
      Number.isNaN(Date.parse(playedOn)) ||
      new Date(playedOn).toISOString().slice(0, 10) !== playedOn
    )
      throw new ConvexError("Use a valid YYYY-MM-DD date");
    const latest = await ctx.db
      .query("sessions")
      .withIndex("by_campaign_and_ordinal", (q) =>
        q.eq("campaign", campaign._id),
      )
      .order("desc")
      .first();
    const id = await ctx.db.insert("sessions", {
      campaign: campaign._id,
      adventure: campaign.currentAdventure,
      playedOn,
      ordinal: (latest?.ordinal ?? 0) + 1,
      scenes: [],
      status: "draft",
      lastTime: "",
      changes: [],
      nextChange: 1,
    });
    const created = await ctx.db.get(id);
    if (!created) throw new Error("Session creation failed");
    return sessionResult(created);
  },
});
export const getArgs = {
  ...callerArgs,
  ref: v.optional(v.string()),
  refs: v.optional(v.array(v.string())),
};
export const getResult = v.object({
  value: v.union(readValue, v.null()),
  items: v.optional(v.array(v.object({ ref: v.string(), value: readValue }))),
});
async function read(
  ctx: QueryCtx,
  campaign: Doc<"campaigns">,
  ref: string,
): Promise<ReadValue> {
  if (ref === "schema") return schemaFor(campaign);
  if (ref === "overview") {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_campaign", (q) => q.eq("campaign", campaign._id))
      .order("desc")
      .take(200);
    const adventures = await ctx.db
      .query("adventures")
      .withIndex("by_campaign", (q) => q.eq("campaign", campaign._id))
      .order("desc")
      .take(200);
    const commits = await ctx.db
      .query("commits")
      .withIndex("by_campaign", (q) => q.eq("campaign", campaign._id))
      .order("desc")
      .take(200);
    const latestSession = commits.find((c) => c.kind === "debrief")?.session;
    return {
      adventures: adventures.map((a) => ({
        id: a._id,
        name: a.name,
        reason: a.reason,
      })),
      sessions: sessions.map(sessionResult),
      commits: commits.map((c) => ({
        id: c._id,
        kind: c.kind,
        reason: c.reason,
        ...(c.session ? { session: c.session } : {}),
        ...(c.schemaChange ? { schemaChange: c.schemaChange } : {}),
      })),
      currentAdventure: campaign.currentAdventure ?? null,
      lastTime: latestSession
        ? (await sessionFor(ctx, campaign._id, latestSession)).lastTime
        : "",
    };
  }
  if (ref.startsWith("transcript:")) {
    const [sessionRef, at] = ref.slice(11).split("@");
    const s = await sessionFor(ctx, campaign._id, sessionRef);
    if (!s.transcript) throw new ConvexError("Upload a transcript first");
    const rows = await ctx.db
      .query("utterances")
      .withIndex("by_session_and_seconds", (q) =>
        at
          ? q
              .eq("session", s._id)
              .gte("seconds", Math.max(0, seconds(at) - 60))
              .lte("seconds", seconds(at) + 60)
          : q.eq("session", s._id),
      )
      .take(2000);
    return {
      session: s._id,
      utterances: rows.map(({ at, seconds, speaker, text }) => ({
        at,
        seconds,
        speaker,
        text,
      })),
      downloadUrl: `${process.env.CONVEX_SITE_URL ?? "https://test.convex.site"}/transcripts/${s._id}`,
    };
  }
  if (ref.startsWith("entity:")) {
    const id = ref.slice(7);
    const e = await ctx.db
      .query("entities")
      .withIndex("by_campaign_and_id", (q) =>
        q.eq("campaign", campaign._id).eq("id", id),
      )
      .unique();
    if (!e) throw new ConvexError("Entity not found");
    const links = await ctx.db
      .query("entityHistory")
      .withIndex("by_campaign_and_entity", (q) =>
        q.eq("campaign", campaign._id).eq("entityId", id),
      )
      .take(2001);
    if (links.length > 2000)
      throw new ConvexError(
        "Entity history exceeds v1 read capacity of 2000 changes",
      );
    const history = await Promise.all(
      links.map((link) => ctx.db.get(link.history)),
    );
    const from = await ctx.db
      .query("relationships")
      .withIndex("by_campaign_and_from", (q) =>
        q.eq("campaign", campaign._id).eq("from", id),
      )
      .take(2000);
    const to = await ctx.db
      .query("relationships")
      .withIndex("by_campaign_and_to", (q) =>
        q.eq("campaign", campaign._id).eq("to", id),
      )
      .take(2000);
    return {
      id: e.id,
      kind: e.kind,
      name: e.name,
      aliases: e.aliases,
      properties: e.properties,
      relationships: [...from, ...to.filter((r) => r.from !== id)].map(
        ({ type, from, to }) => ({
          type,
          from,
          to,
          label: schemaFor(campaign).relationshipTypes[type].label,
          inverseLabel:
            schemaFor(campaign).relationshipTypes[type].inverseLabel,
        }),
      ),
      history: history
        .filter((h): h is Doc<"history"> => h !== null)
        .map(
          ({
            campaign: _campaign,
            entityIds: _ids,
            _id,
            _creationTime,
            searchText,
            ...h
          }) => h,
        ),
    };
  }
  if (ref.startsWith("debrief:")) {
    const s = await sessionFor(ctx, campaign._id, ref.slice(8));
    return {
      session: s._id,
      status: s.status,
      changes: s.changes,
      lastTime: s.lastTime,
    };
  }
  if (ref.startsWith("scene:")) {
    const [session, ordinalText] = ref.slice(6).split("/");
    const s = await sessionFor(ctx, campaign._id, session);
    const ordinal = Number(ordinalText);
    const sc = s.scenes[ordinal - 1];
    if (!sc || !Number.isInteger(ordinal))
      throw new ConvexError("Scene not found");
    const end = sc.end
      ? seconds(sc.end)
      : s.scenes[ordinal]
        ? seconds(s.scenes[ordinal].start)
        : Number.MAX_SAFE_INTEGER;
    const exclusive =
      s.scenes[ordinal] !== undefined &&
      end === seconds(s.scenes[ordinal].start);
    const rows = await ctx.db
      .query("utterances")
      .withIndex("by_session_and_seconds", (q) => {
        const range = q.eq("session", s._id).gte("seconds", seconds(sc.start));
        return exclusive ? range.lt("seconds", end) : range.lte("seconds", end);
      })
      .take(2000);
    return {
      session: s._id,
      ordinal,
      ...sc,
      utterances: rows.map(({ at, seconds, speaker, text }) => ({
        at,
        seconds,
        speaker,
        text,
      })),
    };
  }
  if (ref.startsWith("session:"))
    return sessionResult(await sessionFor(ctx, campaign._id, ref));
  throw new ConvexError(
    "Allowed refs: overview, schema, entity:<id>, session:<id>, scene:<session>/<n>, transcript:<session>[@<timestamp>], debrief:<session>",
  );
}
export const get = internalQuery({
  args: getArgs,
  returns: getResult,
  handler: async (
    ctx,
    { caller, ref, refs },
  ): Promise<Infer<typeof getResult>> => {
    const campaign = await campaignFor(ctx, caller);
    if ((ref !== undefined) === (refs !== undefined))
      throw new ConvexError("Provide ref or refs, not both");
    if (refs) {
      if (!refs.length || refs.length > 25)
        throw new ConvexError("Use 1 to 25 refs");
      return {
        value: null,
        items: await Promise.all(
          refs.map(async (r) => ({
            ref: r,
            value: await read(ctx, campaign, r),
          })),
        ),
      };
    }
    if (ref === undefined) throw new ConvexError("Provide a ref");
    return { value: await read(ctx, campaign, ref) };
  },
});
