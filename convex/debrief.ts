import { ConvexError, type Infer, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  type DraftChange,
  type DraftReveal,
  draft,
  type Entity,
  type History,
  type Proposed,
  type ProposedReveal,
  proposed,
  proposedReveal,
  type Relationship,
  type SchemaInfo,
  type StoryChange,
  scene,
  schemaFor,
  seconds,
  sessionInfo,
  storyChange,
} from "./model";
import { reveal, secretToReveal } from "./secrets";
import { callerArgs, campaignFor, sessionFor, sessionResult } from "./store";
export const sessionArgs = { ...callerArgs, session: v.string() };
export const scenesArgs = { ...sessionArgs, scenes: v.array(scene) };
function encodedSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
function unlocked(s: Doc<"sessions">): void {
  if (s.status === "reference")
    throw new ConvexError("Reference sessions cannot have scenes or a debrief");
  if (s.status === "committed")
    throw new ConvexError(
      "Debrief and scenes are committed. Later fixes use story_commit.",
    );
}
export function draftResult(s: Doc<"sessions">): Infer<typeof draft> {
  if (s.status === "reference")
    throw new ConvexError("Reference sessions have no debrief");
  return {
    session: s._id,
    status: s.status,
    changes: s.changes,
    reveals: s.reveals ?? [],
    briefing: s.briefing ?? "",
  };
}
export const scenesSet = internalMutation({
  args: scenesArgs,
  returns: sessionInfo,
  handler: async (
    ctx,
    { caller, session, scenes },
  ): Promise<Infer<typeof sessionInfo>> => {
    const campaign = await campaignFor(ctx, caller);
    const s = await sessionFor(ctx, campaign._id, session);
    unlocked(s);
    if (!s.transcript) throw new ConvexError("Upload a transcript first");
    if (!scenes.length || scenes.length > 100)
      throw new ConvexError("Use 1 to 100 scenes");
    if (encodedSize(scenes) > 64_000)
      throw new ConvexError("Keep scene descriptions within 64 KB per session");
    if (s.changes.length || s.reveals?.length)
      throw new ConvexError(
        "Drop draft changes and reveals before replacing their scenes",
      );
    const lastUtterance = await ctx.db
      .query("utterances")
      .withIndex("by_session_and_generation_and_seconds", (q) =>
        q
          .eq("session", s._id)
          .eq("transcriptGeneration", s.transcriptGeneration),
      )
      .order("desc")
      .first();
    const last = lastUtterance?.seconds;
    if (last === undefined) throw new ConvexError("Upload a transcript first");
    for (const [i, sc] of scenes.entries()) {
      const start = seconds(sc.start);
      const end = sc.end
        ? seconds(sc.end)
        : scenes[i + 1]
          ? seconds(scenes[i + 1].start)
          : last;
      if (
        start > last ||
        end > last ||
        end < start ||
        (i > 0 && start <= seconds(scenes[i - 1].start)) ||
        (i > 0 &&
          scenes[i - 1].end !== undefined &&
          start < seconds(scenes[i - 1].end ?? ""))
      )
        throw new ConvexError(
          "Scenes must be ordered, non-overlapping and inside the transcript",
        );
    }
    for (const old of await ctx.db
      .query("scenes")
      .withIndex("by_session", (q) => q.eq("session", s._id))
      .take(100))
      await ctx.db.delete(old._id);
    for (const [i, sc] of scenes.entries())
      await ctx.db.insert("scenes", {
        campaign: campaign._id,
        session: s._id,
        ordinal: i + 1,
        ...sc,
        searchText: `${sc.title} ${sc.place} ${sc.summary}`,
      });
    await ctx.db.patch(s._id, { scenes });
    return sessionResult({ ...s, scenes });
  },
});
export function entityText(e: Entity): string {
  return [e.name, ...e.aliases, ...Object.values(e.properties)].join(" ");
}
type Applied = {
  before: Entity | Relationship | null;
  after: Entity | Relationship | null;
  ids: string[];
};
class DraftState {
  readonly entities = new Map<string, Entity>();
  readonly temps = new Map<string, string>();
  readonly relationships: Relationship[];
  constructor(
    entities: Entity[],
    relationships: Relationship[],
    readonly schema: SchemaInfo,
  ) {
    for (const entity of entities) this.entities.set(entity.id, entity);
    this.relationships = [...relationships];
  }
  resolve(ref: string): Entity {
    if (
      !ref.startsWith("$") &&
      ref.replace(/^entity:/, "").startsWith("draft-")
    )
      throw new ConvexError("Use $tempKey for an entity created in this draft");
    const id = ref.startsWith("$")
      ? this.temps.get(ref.slice(1))
      : ref.replace(/^entity:/, "");
    const entity = id ? this.entities.get(id) : undefined;
    if (!entity)
      throw new ConvexError(
        `Entity not found: ${ref}. Use find or an earlier $tempKey.`,
      );
    return entity;
  }
  name(id: string): string {
    return this.entities.get(id)?.name ?? id;
  }
  properties(kind: string, properties: Record<string, string | number>): void {
    const kinds = this.schema.kinds;
    const fields = kinds[kind];
    if (!Object.hasOwn(kinds, kind))
      throw new ConvexError(`Allowed kinds: ${Object.keys(kinds).join(", ")}`);
    for (const [key, value] of Object.entries(properties)) {
      const type = fields[key];
      if (!Object.hasOwn(fields, key))
        throw new ConvexError(
          `Allowed properties for ${kind}: ${Object.keys(fields).join(", ")}`,
        );
      if (
        Array.isArray(type)
          ? !type.includes(String(value)) || typeof value !== "string"
          : typeof value !== (type === "number" ? "number" : "string")
      )
        throw new ConvexError(
          `Allowed value for ${kind}.${key}: ${Array.isArray(type) ? type.join(", ") : type}`,
        );
    }
  }
  apply(p: StoryChange, id: string): Applied {
    if (
      !p.basis.length ||
      !p.sources.length ||
      p.sources.some((s) => !s.quote.trim()) ||
      !p.why.trim()
    )
      throw new ConvexError(
        "At least one basis, one non-empty source and why are required",
      );
    for (const source of p.sources)
      if (source.at !== undefined) seconds(source.at);
    const guess = p.basis.every(
      (b) => b === "player_guess" || b === "player_plan",
    );
    const allowed = (kind: string): void => {
      if (guess && kind !== "thread" && kind !== "character_goal")
        throw new ConvexError(
          "player_guess/player_plan may touch only thread or character_goal",
        );
    };
    const op = p.change;
    if (op.op === "new") {
      this.properties(op.kind, op.properties ?? {});
      allowed(op.kind);
      if (!op.name.trim()) throw new ConvexError("An entity needs a name");
      if (op.tempKey && this.temps.has(op.tempKey))
        throw new ConvexError(`Duplicate tempKey: ${op.tempKey}`);
      const entity = {
        id,
        kind: op.kind,
        name: op.name,
        aliases: op.aliases ?? [],
        properties: op.properties ?? {},
      };
      this.entities.set(id, entity);
      if (op.tempKey) this.temps.set(op.tempKey, id);
      return { before: null, after: entity, ids: [id] };
    }
    if (op.op === "update") {
      const before = this.resolve(op.entity);
      allowed(before.kind);
      this.properties(before.kind, op.properties ?? {});
      const after = {
        ...before,
        properties: { ...before.properties, ...op.properties },
        aliases: [...new Set([...before.aliases, ...(op.addAliases ?? [])])],
      };
      this.entities.set(before.id, after);
      return { before, after, ids: [before.id] };
    }
    const relationshipTypes = this.schema.relationshipTypes;
    const type = relationshipTypes[op.type];
    if (!Object.hasOwn(relationshipTypes, op.type))
      throw new ConvexError(
        `Allowed relationship types: ${Object.keys(relationshipTypes).join(", ")}`,
      );
    const from = this.resolve(op.from);
    const to = this.resolve(op.to);
    allowed(from.kind);
    allowed(to.kind);
    if (!type.from.includes(from.kind) || !type.to.includes(to.kind))
      throw new ConvexError(
        `Allowed endpoints for ${op.type}: ${type.from.join(", ")} -> ${type.to.join(", ")}`,
      );
    const rel = { type: op.type, from: from.id, to: to.id };
    const index = this.relationships.findIndex(
      (r) => r.type === rel.type && r.from === rel.from && r.to === rel.to,
    );
    if (op.op === "relate") {
      if (index >= 0) throw new ConvexError("Relationship already exists");
      this.relationships.push(rel);
      return { before: null, after: rel, ids: [from.id, to.id] };
    }
    if (index < 0) throw new ConvexError("Relationship not found");
    this.relationships.splice(index, 1);
    return { before: rel, after: null, ids: [from.id, to.id] };
  }
}
function changeName(
  state: DraftState,
  { change }: Proposed,
  { before, after }: Applied,
): string {
  if (change.op === "relate" || change.op === "unrelate") {
    const rel = (after ?? before) as Relationship;
    const { label } = state.schema.relationshipTypes[rel.type];
    const verb = change.op === "relate" ? "link" : "unlink";
    return `${verb} ${state.name(rel.from)} ${label} ${state.name(rel.to)}`;
  }
  const { name } = after as Entity;
  if (change.op === "new") return `new ${name}`;
  return `${change.properties?.status === "closed" ? "closed" : "change"} ${name}`;
}
async function stateFor(
  ctx: QueryCtx,
  campaign: Doc<"campaigns">,
): Promise<DraftState> {
  const entities = await ctx.db
    .query("entities")
    .withIndex("by_campaign", (q) => q.eq("campaign", campaign._id))
    .take(2001);
  const relationships = await ctx.db
    .query("relationships")
    .withIndex("by_campaign", (q) => q.eq("campaign", campaign._id))
    .take(2001);
  if (entities.length > 2000 || relationships.length > 2000)
    throw new ConvexError(
      "Campaign exceeds the v1 debrief capacity of 2000 entities or relationships",
    );
  return new DraftState(
    entities.map((e) => ({
      id: e.id,
      kind: e.kind,
      name: e.name,
      aliases: e.aliases,
      properties: e.properties,
    })),
    relationships.map((r) => ({ type: r.type, from: r.from, to: r.to })),
    schemaFor(campaign),
  );
}
function validScene(s: Doc<"sessions">, p: { scene: number }): void {
  if (!Number.isInteger(p.scene) || p.scene < 1 || p.scene > s.scenes.length)
    throw new ConvexError("Use an existing scene ordinal");
}
function applyPendingChange(
  session: Doc<"sessions">,
  state: DraftState,
  proposal: DraftChange,
  id: string,
): ReturnType<DraftState["apply"]> {
  try {
    validScene(session, proposal);
    return state.apply(proposal, id);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Invalid change";
    throw new ConvexError(
      `Pending change ${proposal.id} is no longer valid: ${reason}. Use debrief_drop to remove it first.`,
    );
  }
}
async function checkReveal(
  ctx: QueryCtx,
  campaign: Doc<"campaigns">,
  s: Doc<"sessions">,
  proposal: ProposedReveal,
  others: DraftReveal[],
): Promise<Doc<"secrets">> {
  if (encodedSize(proposal) > 16_000)
    throw new ConvexError("Keep each reveal within 16 KB");
  validScene(s, proposal);
  if (!proposal.learned.trim())
    throw new ConvexError("A reveal needs what the players learned");
  if (!proposal.sources.length || proposal.sources.some((s) => !s.quote.trim()))
    throw new ConvexError("A reveal needs at least one non-empty source");
  for (const source of proposal.sources)
    if (source.at !== undefined) seconds(source.at);
  if (others.some((other) => other.secret === proposal.secret))
    throw new ConvexError("This secret already has a reveal in this draft");
  return secretToReveal(ctx, campaign, proposal.secret);
}
async function checkPendingReveal(
  ctx: QueryCtx,
  campaign: Doc<"campaigns">,
  s: Doc<"sessions">,
  pending: DraftReveal,
): Promise<Doc<"secrets">> {
  const others = (s.reveals ?? []).filter((other) => other.id !== pending.id);
  try {
    return await checkReveal(ctx, campaign, s, pending, others);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Invalid reveal";
    throw new ConvexError(
      `Pending reveal ${pending.id} is no longer valid: ${reason}. Use debrief_drop to remove it first.`,
    );
  }
}
const rejection = v.array(v.object({ index: v.number(), reason: v.string() }));
type Rejection = Infer<typeof rejection>[number];
function rejectionOf(index: number, error: unknown): Rejection {
  return {
    index,
    reason: error instanceof Error ? error.message : "Invalid entry",
  };
}
export const addArgs = {
  ...sessionArgs,
  changes: v.array(proposed),
  reveals: v.optional(v.array(proposedReveal)),
  briefing: v.optional(v.string()),
};
export const addResult = v.object({
  draft,
  rejected: rejection,
  rejectedReveals: rejection,
});
export const add = internalMutation({
  args: addArgs,
  returns: addResult,
  handler: async (
    ctx,
    { caller, session, changes, reveals = [], briefing },
  ): Promise<Infer<typeof addResult>> => {
    const campaign = await campaignFor(ctx, caller);
    const s = await sessionFor(ctx, campaign._id, session);
    unlocked(s);
    if (!s.scenes.length) throw new ConvexError("Call scenes_set first");
    const keptReveals: DraftReveal[] = [...(s.reveals ?? [])];
    if (
      s.changes.length + keptReveals.length + changes.length + reveals.length >
      500
    )
      throw new ConvexError("Use at most 500 draft changes and reveals");
    if (encodedSize(briefing ?? s.briefing) > 16_000)
      throw new ConvexError("Keep the briefing within 16 KB");
    const state = await stateFor(ctx, campaign);
    for (const p of s.changes) applyPendingChange(s, state, p, `draft-${p.id}`);
    const kept: DraftChange[] = [...s.changes];
    const rejected: Rejection[] = [];
    const rejectedReveals: Rejection[] = [];
    let nextChange = s.nextChange;
    const fitsDraft = (entry: DraftChange | DraftReveal) => {
      if (encodedSize([...kept, ...keptReveals, entry]) > 512_000)
        throw new ConvexError(
          "Keep the draft within 512 KB; drop or shorten proposals",
        );
    };
    for (const [index, p] of changes.entries()) {
      const id = `c${nextChange}`;
      try {
        if (encodedSize(p) > 16_000)
          throw new ConvexError("Keep each proposed change within 16 KB");
        fitsDraft({ ...p, id });
        validScene(s, p);
        state.apply(p, `draft-${id}`);
        kept.push({ ...p, id });
        nextChange++;
      } catch (error) {
        rejected.push(rejectionOf(index, error));
      }
    }
    for (const [index, proposal] of reveals.entries()) {
      const pending = { ...proposal, id: `r${nextChange}` };
      try {
        fitsDraft(pending);
        await checkReveal(ctx, campaign, s, proposal, keptReveals);
        keptReveals.push(pending);
        nextChange++;
      } catch (error) {
        rejectedReveals.push(rejectionOf(index, error));
      }
    }
    const updated = {
      ...s,
      changes: kept,
      reveals: keptReveals,
      briefing: briefing ?? s.briefing,
      nextChange,
    };
    await ctx.db.patch(s._id, {
      changes: kept,
      reveals: keptReveals,
      briefing: updated.briefing,
      nextChange,
    });
    return {
      draft: draftResult(updated),
      rejected,
      rejectedReveals,
    };
  },
});
async function changeNamesById(
  ctx: QueryCtx,
  campaign: Doc<"campaigns">,
  s: Doc<"sessions">,
): Promise<Map<string, string>> {
  const state = await stateFor(ctx, campaign);
  const names = new Map<string, string>();
  for (const p of s.changes) {
    try {
      names.set(
        p.id,
        changeName(state, p, applyPendingChange(s, state, p, `draft-${p.id}`)),
      );
    } catch {}
  }
  return names;
}
function dependentName(
  s: Doc<"sessions">,
  names: Map<string, string>,
  id: string,
): string {
  const scene = (s.changes.find((p) => p.id === id) as DraftChange).scene;
  return `${names.get(id)} (scene ${scene})`;
}
export const dropArgs = { ...sessionArgs, changeIds: v.array(v.string()) };
export const draftResponse = v.object({ draft });
export const drop = internalMutation({
  args: dropArgs,
  returns: draftResponse,
  handler: async (
    ctx,
    { caller, session, changeIds },
  ): Promise<Infer<typeof draftResponse>> => {
    const campaign = await campaignFor(ctx, caller);
    const s = await sessionFor(ctx, campaign._id, session);
    unlocked(s);
    const drafted = [...s.changes, ...(s.reveals ?? [])];
    if (changeIds.some((id) => !drafted.some((entry) => entry.id === id)))
      throw new ConvexError("Change or reveal not found in this draft");
    const changes = s.changes.filter((p) => !changeIds.includes(p.id));
    const reveals = (s.reveals ?? []).filter((r) => !changeIds.includes(r.id));
    const state = await stateFor(ctx, campaign);
    const invalid: { id: string; reason: string }[] = [];
    for (const p of changes) {
      try {
        applyPendingChange(s, state, p, `draft-${p.id}`);
      } catch (error) {
        invalid.push({
          id: p.id,
          reason: error instanceof Error ? error.message : "Invalid change",
        });
      }
    }
    if (invalid.length) {
      const shown = await changeNamesById(ctx, campaign, s);
      if (invalid.every((entry) => shown.has(entry.id)))
        throw new ConvexError(
          `Drop the dependent changes first: ${invalid.map((entry) => dependentName(s, shown, entry.id)).join(", ")}.`,
        );
      throw new ConvexError(
        `Drop also requires invalid remaining changes: ${invalid.map((entry) => entry.id).join(", ")}. ${invalid.map((entry) => entry.reason).join(" ")}`,
      );
    }
    await ctx.db.patch(s._id, { changes, reveals });
    return { draft: draftResult({ ...s, changes, reveals }) };
  },
});
async function persist(
  ctx: MutationCtx,
  campaign: Id<"campaigns">,
  record: History,
  ids: string[],
): Promise<void> {
  const after = record.after;
  if (after && "name" in after) {
    const existing = await ctx.db
      .query("entities")
      .withIndex("by_campaign_and_id", (q) =>
        q.eq("campaign", campaign).eq("id", after.id),
      )
      .unique();
    if (existing)
      await ctx.db.patch(existing._id, {
        ...after,
        searchText: entityText(after),
      });
    else
      await ctx.db.insert("entities", {
        campaign,
        ...after,
        searchText: entityText(after),
      });
  } else {
    const rel = (after ?? record.before) as Relationship;
    const existing = (
      await ctx.db
        .query("relationships")
        .withIndex("by_campaign_and_from", (q) =>
          q.eq("campaign", campaign).eq("from", rel.from),
        )
        .take(2001)
    ).find((r) => r.to === rel.to && r.type === rel.type);
    if (after) await ctx.db.insert("relationships", { campaign, ...rel });
    else if (existing) await ctx.db.delete(existing._id);
  }
  const history = await ctx.db.insert("history", {
    campaign,
    ...record,
    entityIds: ids,
    searchText: `${record.sources.map((s) => s.quote).join(" ")} ${record.why} ${record.basis.join(" ")}`,
  });
  for (const entityId of new Set(ids))
    await ctx.db.insert("entityHistory", { campaign, entityId, history });
}
export const commitResult = v.object({ commit: v.string(), draft });
export const commit = internalMutation({
  args: sessionArgs,
  returns: commitResult,
  handler: async (
    ctx,
    { caller, session },
  ): Promise<Infer<typeof commitResult>> => {
    const campaign = await campaignFor(ctx, caller);
    const s = await sessionFor(ctx, campaign._id, session);
    unlocked(s);
    if (!s.changes.length || !s.briefing?.trim())
      throw new ConvexError("A commit needs draft changes and a briefing");
    const state = await stateFor(ctx, campaign);
    const records = s.changes.map((p) => {
      return { p, ...applyPendingChange(s, state, p, crypto.randomUUID()) };
    });
    const revealed: { pending: DraftReveal; row: Doc<"secrets"> }[] = [];
    for (const pending of s.reveals ?? [])
      revealed.push({
        pending,
        row: await checkPendingReveal(ctx, campaign, s, pending),
      });
    const id = await ctx.db.insert("commits", {
      campaign: campaign._id,
      kind: "debrief",
      reason: "Commit reviewed debrief",
      session: s._id,
    });
    for (const r of records)
      await persist(
        ctx,
        campaign._id,
        {
          commit: id,
          session: s._id,
          scene: r.p.scene,
          change: r.p.change,
          basis: r.p.basis,
          sources: r.p.sources,
          why: r.p.why,
          before: r.before,
          after: r.after,
        },
        r.ids,
      );
    for (const { pending, row } of revealed)
      await reveal(ctx, row, pending, { commit: id, session: s._id });
    await ctx.db.patch(s._id, { status: "committed" });
    return { commit: id, draft: draftResult({ ...s, status: "committed" }) };
  },
});

export const storyArgs = {
  ...callerArgs,
  reason: v.string(),
  changes: v.array(storyChange),
};
export const storyResult = v.object({ commit: v.string() });
export const storyCommit = internalMutation({
  args: storyArgs,
  returns: storyResult,
  handler: async (
    ctx,
    { caller, reason, changes },
  ): Promise<Infer<typeof storyResult>> => {
    if (!reason.trim()) throw new ConvexError("A reason is required");
    if (!changes.length)
      throw new ConvexError("Provide at least one story change");
    if (changes.length > 500)
      throw new ConvexError("Use at most 500 story changes");
    if (encodedSize({ reason, changes }) > 512_000)
      throw new ConvexError("Keep a story commit within 512 KB");
    if (changes.some((p) => encodedSize(p) > 16_000))
      throw new ConvexError("Keep each story change within 16 KB");
    const campaign = await campaignFor(ctx, caller);
    const state = await stateFor(ctx, campaign);
    const records = changes.map((p, index) => {
      try {
        return { p, ...state.apply(p, crypto.randomUUID()) };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid change";
        throw new ConvexError(`Change ${index + 1}: ${message}`);
      }
    });
    const id = await ctx.db.insert("commits", {
      campaign: campaign._id,
      kind: "story",
      reason,
    });
    for (const r of records)
      await persist(
        ctx,
        campaign._id,
        {
          commit: id,
          ...r.p,
          before: r.before,
          after: r.after,
        },
        r.ids,
      );
    return { commit: id };
  },
});
