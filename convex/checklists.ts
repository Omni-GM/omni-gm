import { ConvexError, type Infer, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { checklist } from "./model";
import { callerArgs, campaignFor } from "./store";

export const checklistArgs = {
  ...callerArgs,
  ...checklist.fields,
  reason: v.string(),
};
export const checklistResult = v.object({ commit: v.string(), checklist });
export const set = internalMutation({
  args: checklistArgs,
  returns: checklistResult,
  handler: async (
    ctx,
    { caller, sections, template, reason },
  ): Promise<Infer<typeof checklistResult>> => {
    if (!sections.length || sections.length > 100)
      throw new ConvexError("Provide 1 to 100 sections");
    if (!reason.trim()) throw new ConvexError("A reason is required");
    if (!template.trim())
      throw new ConvexError("A markdown template is required");
    if (sections.some((s) => !s.name.trim() || !s.definition.trim()))
      throw new ConvexError("Section names and definitions must be non-empty");
    if (
      new Set(sections.map((s) => s.name.trim().toLowerCase())).size !==
      sections.length
    )
      throw new ConvexError("Section names must be unique");
    if (
      new TextEncoder().encode(JSON.stringify({ sections, template, reason }))
        .length > 32_000
    )
      throw new ConvexError(
        "Checklist, template and reason must fit within 32 KB",
      );
    const campaign = await campaignFor(ctx, caller);
    const saved = await ctx.db
      .query("checklists")
      .withIndex("by_campaign", (q) => q.eq("campaign", campaign._id))
      .unique();
    const after = { sections, template };
    const before = saved
      ? { sections: saved.sections, template: saved.template }
      : null;
    const commit = await ctx.db.insert("commits", {
      campaign: campaign._id,
      kind: "checklist",
      reason,
      checklistChange: { before, after },
    });
    if (saved) await ctx.db.patch(saved._id, after);
    else
      await ctx.db.insert("checklists", { campaign: campaign._id, ...after });
    return { commit, checklist: after };
  },
});
