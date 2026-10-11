import { ConvexError, type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalQuery } from "./_generated/server";
import { kinds as entityKinds } from "./model";
import {
  continuation,
  pageArgs,
  pageInfo,
  pageLimit,
  position,
} from "./pagination";
import { callerArgs, campaignFor } from "./store";

const hitType = v.union(
  v.literal("entity"),
  v.literal("source"),
  v.literal("scene"),
  v.literal("transcript"),
);
const hit = v.object({
  id: v.string(),
  ref: v.string(),
  type: hitType,
  title: v.string(),
  snippet: v.optional(v.string()),
  score: v.optional(v.number()),
});
export const findArgs = {
  ...callerArgs,
  ...pageArgs,
  query: v.optional(v.string()),
  types: v.optional(v.array(hitType)),
  kinds: v.optional(v.array(v.string())),
};
export const findResult = v.object({
  query: v.union(v.string(), v.null()),
  total: v.number(),
  totalIsExact: v.boolean(),
  order: v.literal("type_then_page_relevance"),
  hits: v.array(hit),
  ...pageInfo,
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
const streamResult = v.object({
  hits: v.array(hit),
  cursor: v.string(),
  done: v.boolean(),
});
export const searchPage = internalQuery({
  args: {
    campaign: v.id("campaigns"),
    type: hitType,
    kind: v.optional(v.string()),
    text: v.union(v.string(), v.null()),
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
  },
  returns: streamResult,
  handler: async (
    ctx,
    { campaign, type, kind, text, cursor, limit },
  ): Promise<Infer<typeof streamResult>> => {
    const opts = {
      numItems: limit,
      cursor,
      maximumRowsRead: 200,
      maximumBytesRead: 500_000,
    };
    const words = text?.split(" ") ?? [];
    function ranked<T extends { searchText: string }>(
      rows: T[],
    ): { row: T; score?: number }[] {
      if (!text) return rows.map((row) => ({ row }));
      return rows
        .map((row) => {
          const tokens = new Set(
            row.searchText.toLowerCase().split(/[^\p{L}\p{N}]+/u),
          );
          return {
            row,
            score: words.filter((word) => tokens.has(word)).length,
          };
        })
        .filter((hit) => (hit.score ?? 0) > 0)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }
    if (type === "entity") {
      const page = await ctx.db
        .query("entities")
        .withIndex("by_campaign_and_kind", (q) =>
          kind === undefined
            ? q.eq("campaign", campaign)
            : q.eq("campaign", campaign).eq("kind", kind),
        )
        .paginate(opts);
      return {
        cursor: page.continueCursor,
        done: page.isDone,
        hits: ranked(page.page).map(({ row, score }) => ({
          id: row._id,
          ref: `entity:${row.id}`,
          type,
          title: row.name,
          snippet: row.searchText.slice(0, 240),
          ...(score === undefined ? {} : { score }),
        })),
      };
    }
    if (type === "scene") {
      const page = await ctx.db
        .query("scenes")
        .withIndex("by_campaign", (q) => q.eq("campaign", campaign))
        .order("desc")
        .paginate(opts);
      return {
        cursor: page.continueCursor,
        done: page.isDone,
        hits: ranked(page.page).map(({ row, score }) => ({
          id: row._id,
          ref: `scene:${row.session}/${row.ordinal}`,
          type,
          title: row.title,
          snippet: `${row.place}: ${row.summary}`.slice(0, 240),
          ...(score === undefined ? {} : { score }),
        })),
      };
    }
    if (!text) return { cursor: "", done: true, hits: [] };
    if (type === "source") {
      const page = await ctx.db
        .query("history")
        .withIndex("by_campaign", (q) => q.eq("campaign", campaign))
        .paginate(opts);
      return {
        cursor: page.continueCursor,
        done: page.isDone,
        hits: ranked(page.page).map(({ row, score }) => ({
          id: row._id,
          ref: `entity:${row.entityIds[0]}`,
          type,
          title: row.why,
          snippet:
            `${row.basis.join(", ")}: ${row.sources.map((s) => s.quote).join(" ")}`.slice(
              0,
              240,
            ),
          ...(score === undefined ? {} : { score }),
        })),
      };
    }
    const page = await ctx.db
      .query("utterances")
      .withIndex("by_campaign", (q) => q.eq("campaign", campaign))
      .paginate(opts);
    const visible = [];
    for (const row of page.page) {
      const session = await ctx.db.get(row.session);
      if (
        session?.transcript &&
        session.transcriptGeneration === row.transcriptGeneration
      )
        visible.push(row);
    }
    return {
      cursor: page.continueCursor,
      done: page.isDone,
      hits: ranked(visible).map(({ row, score }) => ({
        id: row._id,
        ref: `transcript:${row.session}@${row.at}`,
        type,
        title: `${row.at} ${row.speaker}`,
        snippet: row.text.slice(0, 240),
        ...(score === undefined ? {} : { score }),
      })),
    };
  },
});
export const find = internalQuery({
  args: findArgs,
  returns: findResult,
  handler: async (
    ctx,
    { caller, query, types, kinds, limit, cursor },
  ): Promise<Infer<typeof findResult>> => {
    const campaign = await campaignFor(ctx, caller);
    const maximum = pageLimit(limit, query === undefined ? 100 : 10);
    if (kinds?.some((kind) => !Object.hasOwn(entityKinds, kind)))
      throw new ConvexError(
        `Allowed kinds: ${Object.keys(entityKinds).join(", ")}`,
      );
    if (query && query.length > 1024)
      throw new ConvexError("Keep the search query within 1024 characters");
    const words = (query ?? "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w && !stopWords.has(w));
    if (words.length > 8)
      throw new ConvexError("Use at most 8 search keywords");
    const streams: { type: Infer<typeof hitType>; kind?: string }[] = [];
    for (const type of ["entity", "source", "scene", "transcript"] as const) {
      if (types && !types.includes(type)) continue;
      if (query === undefined && type !== "entity" && type !== "scene")
        continue;
      if (type === "entity" && kinds)
        for (const kind of [...new Set(kinds)].sort())
          streams.push({ type, kind });
      else streams.push({ type });
    }
    const scope = JSON.stringify([campaign._id, query ?? null, streams]);
    let start = position(scope, cursor);
    if (start.stream > streams.length)
      throw new ConvexError("Cursor stream is invalid");
    const hits: Infer<typeof hit>[] = [];
    if (query === undefined || words.length) {
      while (start.stream < streams.length && hits.length < maximum) {
        const page: Infer<typeof streamResult> = await ctx.runQuery(
          internal.search.searchPage,
          {
            campaign: campaign._id,
            ...streams[start.stream],
            text: query === undefined ? null : words.join(" "),
            cursor: start.cursor,
            limit: maximum - hits.length,
          },
        );
        hits.push(...page.hits);
        start = {
          stream: start.stream + (page.done ? 1 : 0),
          cursor: page.done ? null : page.cursor,
          seen: start.seen + page.hits.length,
        };
        if (!page.done) break;
      }
    } else start = { ...start, stream: streams.length };
    const truncated = start.stream < streams.length;
    return {
      query: query ?? null,
      total: start.seen,
      totalIsExact: !truncated,
      order: "type_then_page_relevance",
      hits,
      truncated,
      nextCursor: truncated ? continuation(scope, start) : null,
    };
  },
});
