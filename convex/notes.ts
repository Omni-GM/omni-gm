import { ConvexError, type Infer, v } from "convex/values";
import { mcpCallerValidator } from "convex-mcp-gateway";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type QueryCtx } from "./_generated/server";
import { noteEntry, sessionNote } from "./model";
import { campaignFor } from "./store";

export async function currentNote(
  ctx: QueryCtx,
  campaign: Doc<"campaigns">,
): Promise<Infer<typeof sessionNote> | null> {
  const debrief = await ctx.db
    .query("commits")
    .withIndex("by_campaign_and_kind", (q) =>
      q.eq("campaign", campaign._id).eq("kind", "debrief"),
    )
    .order("desc")
    .first();
  if (!debrief?.session) return null;
  const session = debrief.session;
  const saved = await ctx.db
    .query("notes")
    .withIndex("by_campaign_and_session", (q) =>
      q.eq("campaign", campaign._id).eq("session", session),
    )
    .unique();
  if (saved) {
    const { _id, _creationTime, campaign: _campaign, ...note } = saved;
    return note;
  }
  const checklist = await ctx.db
    .query("checklists")
    .withIndex("by_campaign", (q) => q.eq("campaign", campaign._id))
    .unique();
  if (!checklist) return null;
  return {
    session,
    checklist: { sections: checklist.sections, template: checklist.template },
    status: "in_progress",
    entries: checklist.sections.map(({ name }) => ({
      section: name,
      entry: "",
      status: "open",
    })),
  };
}

export const noteArgs = {
  caller: mcpCallerValidator,
  session: v.string(),
  op: v.union(v.literal("upsert"), v.literal("finish"), v.literal("reopen")),
  reason: v.optional(v.string()),
  section: v.optional(v.string()),
  entry: v.optional(v.string()),
  status: v.optional(noteEntry.fields.status),
};
export const noteResult = v.object({ note: sessionNote });
export const write = internalMutation({
  args: noteArgs,
  returns: noteResult,
  handler: async (
    ctx,
    { caller, session, op, section, entry, status, reason },
  ): Promise<Infer<typeof noteResult>> => {
    if (entry !== undefined && new TextEncoder().encode(entry).length > 16_000)
      throw new ConvexError("Entry must fit within 16 KB");
    if (reason !== undefined && new TextEncoder().encode(reason).length > 2_000)
      throw new ConvexError("Reason must fit within 2 KB");
    const campaign = await campaignFor(ctx, caller);
    const note = await currentNote(ctx, campaign);
    if (!note)
      throw new ConvexError(
        "Commit a debrief and store a checklist before prep",
      );
    if (session !== note.session)
      throw new ConvexError("Prep changed. Read get note before writing");
    if (op === "reopen") {
      if (note.status !== "finished")
        throw new ConvexError("Only a finished note can be reopened");
      if (!reason?.trim())
        throw new ConvexError("A reason is required to reopen");
      if (section !== undefined || entry !== undefined || status !== undefined)
        throw new ConvexError("Reopen first, then update a section");
      note.status = "in_progress";
      note.reopenReason = reason;
    } else {
      if (note.status === "finished")
        throw new ConvexError(
          "Finished note is read-only. Reopen with a reason first",
        );
      if (reason !== undefined)
        throw new ConvexError("A reason is only used to reopen");
      if (op === "finish") {
        if (
          section !== undefined ||
          entry !== undefined ||
          status !== undefined
        )
          throw new ConvexError("Save section changes before finishing");
        if (note.entries.some((e) => e.status === "open"))
          throw new ConvexError("Resolve open sections before finishing");
        note.status = "finished";
      } else {
        if (!note.entries.some((e) => e.section === section))
          throw new ConvexError("Section is not in this prep's checklist");
        if (entry === undefined && status === undefined)
          throw new ConvexError("Provide an entry or status");
        note.entries = note.entries.map((e) =>
          e.section === section
            ? {
                ...e,
                ...(entry !== undefined ? { entry } : {}),
                ...(status !== undefined ? { status } : {}),
              }
            : e,
        );
      }
    }
    if (new TextEncoder().encode(JSON.stringify(note)).length > 128_000)
      throw new ConvexError("Note must fit within 128 KB");
    const saved = await ctx.db
      .query("notes")
      .withIndex("by_campaign_and_session", (q) =>
        q.eq("campaign", campaign._id).eq("session", note.session),
      )
      .unique();
    if (saved) await ctx.db.patch(saved._id, note);
    else await ctx.db.insert("notes", { campaign: campaign._id, ...note });
    return { note };
  },
});
