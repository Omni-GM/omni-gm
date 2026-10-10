// PROTOTYPE — throwaway. The four deep MCP tools (D6). Each is an internal action that composes the
// store's internal queries and mutations. A real build would make reads queries and writes single mutations.
import { internalAction, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, Infer } from "convex/values";
import { mcpCallerValidator } from "convex-mcp-gateway";
import { Id } from "./_generated/dataModel";
import { changeOp } from "./schema";
import { proposedChange, schemaOp } from "./store";

type Caller = Infer<typeof mcpCallerValidator>;

async function campaignOf(ctx: ActionCtx, caller: Caller) {
  const campaign = await ctx.runQuery(internal.store.campaignForOwner, { ownerId: caller.subject });
  if (!campaign) throw new Error("No campaign yet. Run the seed.");
  return campaign._id;
}

export const readArgs = {
  caller: mcpCallerValidator,
  view: v.union(v.literal("overview"), v.literal("schema"), v.literal("entities"), v.literal("entity")),
  kind: v.optional(v.string()),
  nameContains: v.optional(v.string()),
  entityId: v.optional(v.string()),
  withHistory: v.optional(v.boolean()),
};

export const storyRead = internalAction({
  args: readArgs,
  handler: async (ctx, args): Promise<unknown> => {
    const campaignId = await campaignOf(ctx, args.caller);
    switch (args.view) {
      case "overview":
        return await ctx.runQuery(internal.store.structure, { campaignId });
      case "schema":
        return await ctx.runQuery(internal.store.describeSchema, { campaignId });
      case "entities":
        return await ctx.runQuery(internal.store.findEntities, { campaignId, kind: args.kind, nameContains: args.nameContains });
      case "entity": {
        if (!args.entityId) throw new Error('view "entity" needs entityId.');
        const entityId = args.entityId as Id<"entities">;
        const tip = await ctx.runQuery(internal.store.entityTip, { entityId });
        const history = args.withHistory ? await ctx.runQuery(internal.store.entityHistory, { entityId }) : undefined;
        return { ...tip, history };
      }
    }
  },
});

export const debriefArgs = {
  caller: mcpCallerValidator,
  action: v.union(v.literal("open"), v.literal("propose"), v.literal("drop"), v.literal("show"), v.literal("commit")),
  debriefId: v.optional(v.id("debriefs")),
  sessionId: v.optional(v.id("sessions")),
  newSession: v.optional(
    v.object({
      adventureId: v.id("adventures"),
      playedOn: v.string(),
      scenes: v.array(v.object({ title: v.string(), summary: v.string() })),
    }),
  ),
  summary: v.optional(v.string()),
  shortSummary: v.optional(v.string()),
  changes: v.optional(v.array(proposedChange)),
  changeIds: v.optional(v.array(v.id("draftChanges"))),
};

export const debrief = internalAction({
  args: debriefArgs,
  handler: async (ctx, args): Promise<unknown> => {
    const campaignId = await campaignOf(ctx, args.caller);
    let debriefId = args.debriefId;
    let result: unknown = null;
    switch (args.action) {
      case "open": {
        const sessionId =
          args.sessionId ??
          (args.newSession ? await ctx.runMutation(internal.store.createSession, { campaignId, ...args.newSession }) : null);
        if (!sessionId) throw new Error('action "open" needs sessionId or newSession.');
        debriefId = await ctx.runMutation(internal.store.startDebrief, {
          sessionId,
          summary: args.summary ?? "",
          shortSummary: args.shortSummary ?? "",
        });
        break;
      }
      case "propose":
        result = await ctx.runMutation(internal.store.proposeChanges, { debriefId: need(debriefId), changes: args.changes ?? [] });
        break;
      case "drop":
        for (const changeId of args.changeIds ?? []) await ctx.runMutation(internal.store.dropChange, { changeId });
        result = { dropped: args.changeIds ?? [] };
        break;
      case "commit":
        result = await ctx.runMutation(internal.store.commitDebrief, { debriefId: need(debriefId) });
        break;
    }
    return { result, draft: await ctx.runQuery(internal.store.showDraft, { debriefId: need(debriefId) }) };
  },
});

function need(debriefId: Id<"debriefs"> | undefined) {
  if (!debriefId) throw new Error("This action needs debriefId.");
  return debriefId;
}

export const correctArgs = {
  caller: mcpCallerValidator,
  reason: v.string(),
  changes: v.array(v.object({ change: changeOp, why: v.string(), sceneId: v.optional(v.id("scenes")) })),
};

export const storyCorrect = internalAction({
  args: correctArgs,
  handler: async (ctx, { caller, ...args }): Promise<unknown> =>
    await ctx.runMutation(internal.store.commitCorrection, { campaignId: await campaignOf(ctx, caller), ...args }),
});

export const schemaArgs = { caller: mcpCallerValidator, reason: v.string(), ops: v.array(schemaOp) };

export const schemaChange = internalAction({
  args: schemaArgs,
  handler: async (ctx, { caller, ...args }): Promise<unknown> =>
    await ctx.runMutation(internal.store.changeSchema, { campaignId: await campaignOf(ctx, caller), ...args }),
});
