import { ConvexError, type Infer, v } from "convex/values";
import { mcpCallerValidator } from "convex-mcp-gateway";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type QueryCtx } from "./_generated/server";
import { type ReadValue, type Secret, secret } from "./model";
import { continuation, position } from "./pagination";
import { campaignFor } from "./store";

export const secretArgs = {
  caller: mcpCallerValidator,
  op: v.union(
    v.literal("write"),
    v.literal("change"),
    v.literal("fix"),
    v.literal("drop"),
  ),
  storyCommit: v.optional(v.string()),
  secret: v.optional(v.string()),
  text: v.optional(v.string()),
  about: v.optional(v.array(v.string())),
  reason: v.string(),
};
export const secretResult = v.object({ commit: v.string(), secret });

function record(row: Doc<"secrets">): Secret {
  return { id: row.id, text: row.text, about: row.about, status: row.status };
}
async function secretFor(
  ctx: QueryCtx,
  campaign: Doc<"campaigns">,
  id: string,
) {
  const row = await ctx.db
    .query("secrets")
    .withIndex("by_campaign_and_id", (q) =>
      q.eq("campaign", campaign._id).eq("id", id),
    )
    .unique();
  if (!row) throw new ConvexError("Secret not found");
  return row;
}
export const write = internalMutation({
  args: secretArgs,
  returns: secretResult,
  handler: async (ctx, args): Promise<Infer<typeof secretResult>> => {
    const bytes = (text: string) => new TextEncoder().encode(text).length;
    if (
      [args.secret, args.storyCommit].some(
        (ref) => ref !== undefined && bytes(ref) > 200,
      )
    )
      throw new ConvexError(
        "Keep secret and story commit refs within 200 bytes",
      );
    if (!args.reason.trim() || bytes(args.reason) > 2_000)
      throw new ConvexError("Use a non-empty reason within 2 KB");
    if (
      args.text !== undefined &&
      (!args.text.trim() || bytes(args.text) > 16_000)
    )
      throw new ConvexError("Use non-empty secret text within 16 KB");
    if (
      args.about &&
      (args.about.length > 50 || args.about.some((id) => bytes(id) > 200))
    )
      throw new ConvexError(
        "Use at most 50 entity refs, each within 200 bytes",
      );
    if (
      args.op === "write" &&
      (args.text === undefined || args.secret !== undefined)
    )
      throw new ConvexError("Write needs text and no existing secret ref");
    if (
      args.op === "change" &&
      args.text === undefined &&
      args.about === undefined
    )
      throw new ConvexError("Change needs text or about");
    if (
      ["fix", "drop"].includes(args.op) &&
      (args.text !== undefined || args.about !== undefined)
    )
      throw new ConvexError(
        "Change the secret separately before fixing or dropping it",
      );
    if (args.op !== "fix" && args.storyCommit !== undefined)
      throw new ConvexError("storyCommit is only for a fix");
    const campaign = await campaignFor(ctx, args.caller);
    const beforeRow =
      args.op === "write"
        ? null
        : await secretFor(ctx, campaign, args.secret ?? "");
    const before = beforeRow ? record(beforeRow) : null;
    const about =
      args.about?.map((id) => id.replace(/^entity:/, "")) ??
      before?.about ??
      [];
    for (const id of about) {
      const entity = await ctx.db
        .query("entities")
        .withIndex("by_campaign_and_id", (q) =>
          q.eq("campaign", campaign._id).eq("id", id),
        )
        .unique();
      if (!entity) throw new ConvexError("Entity not found");
    }
    if (args.op === "fix") {
      const commitId = ctx.db.normalizeId("commits", args.storyCommit ?? "");
      const story = commitId ? await ctx.db.get(commitId) : null;
      if (!story || story.campaign !== campaign._id || story.kind !== "story")
        throw new ConvexError(
          "Fix requires a story_commit with basis game_master and the secret's text as its source quote or its full ref in why",
        );
      const changes = await ctx.db
        .query("history")
        .withIndex("by_campaign_and_commit", (q) =>
          q.eq("campaign", campaign._id).eq("commit", story._id),
        )
        .take(501);
      if (
        !changes.some(
          (h) =>
            before !== null &&
            h.basis.includes("game_master") &&
            (h.sources.some((s) => s.quote === before.text) ||
              h.why.includes(before.id)),
        )
      )
        throw new ConvexError(
          "Fix requires a story_commit with basis game_master and the secret's text as its source quote or its full ref in why",
        );
    }
    const after: Secret = {
      id: before?.id ?? `secret:${crypto.randomUUID()}`,
      text: args.text ?? before?.text ?? "",
      about: [...new Set(about)],
      status:
        args.op === "fix"
          ? "fixed"
          : args.op === "drop"
            ? "dropped"
            : (before?.status ?? "hidden"),
    };
    const commit = await ctx.db.insert("commits", {
      campaign: campaign._id,
      kind: "secret",
      reason: args.reason,
      ...(args.op === "fix" ? { storyCommit: args.storyCommit } : {}),
    });
    if (beforeRow) {
      await ctx.db.patch(beforeRow._id, after);
      if (
        ["hidden", "partly_revealed"].includes(beforeRow.status) &&
        ["fixed", "dropped"].includes(after.status)
      )
        await ctx.db.patch(campaign._id, {
          openSecrets: (campaign.openSecrets ?? 0) - 1,
        });
    } else {
      await ctx.db.insert("secrets", { campaign: campaign._id, ...after });
      await ctx.db.patch(campaign._id, {
        openSecrets: (campaign.openSecrets ?? 0) + 1,
      });
    }
    await ctx.db.insert("secretHistory", {
      campaign: campaign._id,
      secret: after.id,
      commit,
      op: args.op,
      reason: args.reason,
      before,
      after,
    });
    return { commit, secret: after };
  },
});

export async function readSecrets(
  ctx: QueryCtx,
  campaign: Doc<"campaigns">,
  ref: string,
  limit: number,
  cursor?: string | null,
): Promise<ReadValue> {
  const scope = JSON.stringify([campaign._id, ref]);
  const start = position(scope, cursor);
  if (ref === "secrets") {
    const states = ["hidden", "partly_revealed"] as const;
    const status = states[start.stream];
    if (!status) throw new ConvexError("Invalid secrets cursor");
    const page = await ctx.db
      .query("secrets")
      .withIndex("by_campaign_and_status", (q) =>
        q.eq("campaign", campaign._id).eq("status", status),
      )
      .paginate({
        numItems: limit,
        cursor: start.cursor,
        maximumBytesRead: 100_000,
      });
    const debrief = await ctx.db
      .query("commits")
      .withIndex("by_campaign_and_kind", (q) =>
        q.eq("campaign", campaign._id).eq("kind", "debrief"),
      )
      .order("desc")
      .first();
    const written = await Promise.all(
      page.page.map(async (row) => {
        const latest = await ctx.db
          .query("secretHistory")
          .withIndex("by_campaign_and_secret", (q) =>
            q.eq("campaign", campaign._id).eq("secret", row.id),
          )
          .order("desc")
          .first();
        return latest &&
          (!debrief ||
            (latest.commit !== debrief._id &&
              latest._creationTime > debrief._creationTime))
          ? row.id
          : null;
      }),
    );
    const done = page.isDone && start.stream === states.length - 1;
    return {
      secrets: page.page.map(record),
      writtenSinceDebrief: written.filter((id): id is string => id !== null),
      truncated: !done,
      nextCursor: done
        ? null
        : continuation(scope, {
            ...start,
            stream: page.isDone ? start.stream + 1 : start.stream,
            cursor: page.isDone ? null : page.continueCursor,
          }),
    };
  }
  const row = await secretFor(ctx, campaign, ref);
  const page = await ctx.db
    .query("secretHistory")
    .withIndex("by_campaign_and_secret", (q) =>
      q.eq("campaign", campaign._id).eq("secret", row.id),
    )
    .paginate({
      numItems: Math.min(limit, 10),
      cursor: start.cursor,
      maximumBytesRead: 100_000,
    });
  return {
    ...record(row),
    history: page.page.map(
      ({ campaign: _campaign, secret: _secret, _id, _creationTime, ...h }) => h,
    ),
    truncated: !page.isDone,
    nextCursor: page.isDone
      ? null
      : continuation(scope, { ...start, cursor: page.continueCursor }),
  };
}
