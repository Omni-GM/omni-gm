import { ConvexError, type Infer, v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { callerArgs, campaignFor } from "./store";

const hitType = v.union(
  v.literal("entity"),
  v.literal("source"),
  v.literal("scene"),
  v.literal("transcript"),
);
export const findArgs = {
  ...callerArgs,
  query: v.optional(v.string()),
  types: v.optional(v.array(hitType)),
  kinds: v.optional(v.array(v.string())),
  limit: v.optional(v.number()),
};
export const findResult = v.object({
  query: v.union(v.string(), v.null()),
  total: v.number(),
  hits: v.array(
    v.object({
      ref: v.string(),
      type: hitType,
      title: v.string(),
      snippet: v.optional(v.string()),
      score: v.optional(v.number()),
    }),
  ),
});
const stopWords = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "in",
  "at",
  "to",
  "is",
  "was",
]);
export const find = internalQuery({
  args: findArgs,
  returns: findResult,
  handler: async (
    ctx,
    { caller, query, types, kinds, limit },
  ): Promise<Infer<typeof findResult>> => {
    const campaign = await campaignFor(ctx, caller);
    const maximum = limit ?? (query === undefined ? 100 : 10);
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 200)
      throw new ConvexError("Use a limit from 1 to 200");
    const words = (query ?? "")
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w && !stopWords.has(w));
    const hits = new Map<string, Infer<typeof findResult>["hits"][number]>();
    const wants = (type: Infer<typeof hitType>): boolean =>
      !types || types.includes(type);
    const add = (hit: Infer<typeof findResult>["hits"][number]): void => {
      const old = hits.get(`${hit.type}:${hit.ref}`);
      hits.set(`${hit.type}:${hit.ref}`, {
        ...hit,
        score: (old?.score ?? 0) + 1,
      });
    };
    if (query !== undefined && !words.length)
      return { query, total: 0, hits: [] };
    if (wants("entity")) {
      const batches = words.length
        ? await Promise.all(
            words.map((word) =>
              ctx.db
                .query("entities")
                .withSearchIndex("search_text", (q) =>
                  q.search("searchText", word).eq("campaign", campaign._id),
                )
                .take(200),
            ),
          )
        : [
            await ctx.db
              .query("entities")
              .withIndex("by_campaign", (q) => q.eq("campaign", campaign._id))
              .take(2000),
          ];
      for (const [wordIndex, rows] of batches.entries())
        for (const [rank, row] of rows.entries())
          if (!kinds || kinds.includes(row.kind)) {
            const ref = `entity:${row.id}`;
            const old = hits.get(`entity:${ref}`);
            hits.set(`entity:${ref}`, {
              ref,
              type: "entity",
              title: row.name,
              snippet: row.searchText.slice(0, 240),
              ...(words.length
                ? {
                    score:
                      (old?.score ?? 0) +
                      1 / (rank + 1) +
                      (wordIndex === 0 ? 0.001 : 0),
                  }
                : {}),
            });
          }
    }
    if (wants("scene")) {
      if (words.length) {
        for (const word of words)
          for (const row of await ctx.db
            .query("scenes")
            .withSearchIndex("search_text", (q) =>
              q.search("searchText", word).eq("campaign", campaign._id),
            )
            .take(200))
            add({
              ref: `scene:${row.session}/${row.ordinal}`,
              type: "scene",
              title: row.title,
              snippet: `${row.place}: ${row.summary}`,
            });
      } else {
        const sessions = await ctx.db
          .query("sessions")
          .withIndex("by_campaign", (q) => q.eq("campaign", campaign._id))
          .order("desc")
          .take(200);
        for (const s of sessions)
          for (const [i, sc] of s.scenes.entries())
            add({
              ref: `scene:${s._id}/${i + 1}`,
              type: "scene",
              title: sc.title,
              snippet: `${sc.place}: ${sc.summary}`,
            });
      }
    }
    if (words.length && wants("source"))
      for (const word of words)
        for (const row of await ctx.db
          .query("history")
          .withSearchIndex("search_text", (q) =>
            q.search("searchText", word).eq("campaign", campaign._id),
          )
          .take(200)) {
          add({
            ref: `entity:${row.entityIds[0]}`,
            type: "source",
            title: row.why,
            snippet: `${row.basis.join(", ")}: ${row.sources.map((s) => s.quote).join(" ")}`,
          });
        }
    if (words.length && wants("transcript"))
      for (const word of words)
        for (const row of await ctx.db
          .query("utterances")
          .withSearchIndex("search_text", (q) =>
            q.search("searchText", word).eq("campaign", campaign._id),
          )
          .take(200))
          add({
            ref: `transcript:${row.session}@${row.at}`,
            type: "transcript",
            title: `${row.at} ${row.speaker}`,
            snippet: row.text.slice(0, 240),
          });
    const ranked = [...hits.values()].sort(
      (a, b) =>
        (b.score ?? 0) - (a.score ?? 0) || a.title.localeCompare(b.title),
    );
    return {
      query: query ?? null,
      total: ranked.length,
      hits: ranked.slice(0, maximum),
    };
  },
});
