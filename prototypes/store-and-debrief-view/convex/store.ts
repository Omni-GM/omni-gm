// PROTOTYPE — throwaway. Domain functions behind the MCP endpoint. All internal:
// nothing here is reachable from a public Convex client, only through /mcp.
import { internalMutation, internalQuery, MutationCtx, QueryCtx } from "./_generated/server";
import { v, Infer } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { changeOp, transcriptRef, valueType } from "./schema";

type Change = Infer<typeof changeOp>;
type Ctx = QueryCtx | MutationCtx;

const MAX_LIST = 25;

export const proposedChange = v.object({
  scene: v.number(),
  change: changeOp,
  transcript: transcriptRef,
  why: v.string(),
});

// ---------- reads ----------

export const campaignForOwner = internalQuery({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    return await ctx.db.query("campaigns").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).first();
  },
});

export const describeSchema = internalQuery({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }) => describeSchemaOf(ctx, campaignId),
});

async function describeSchemaOf(ctx: Ctx, campaignId: Id<"campaigns">) {
  const kinds = await ctx.db.query("kindDefinitions").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).collect();
  const properties = await ctx.db
    .query("propertyDefinitions")
    .withIndex("by_campaign_kind", (q) => q.eq("campaignId", campaignId))
    .collect();
  const relationships = await ctx.db
    .query("relationshipDefinitions")
    .withIndex("by_campaign_type", (q) => q.eq("campaignId", campaignId))
    .collect();
  return {
    kinds: kinds.map((k) => ({
      kind: k.kind,
      label: k.label,
      description: k.description,
      properties: properties
        .filter((p) => p.kind === k.kind && !p.retired)
        .map((p) => ({ key: p.key, type: p.valueType, enumValues: p.enumValues, description: p.description })),
    })),
    relationshipTypes: relationships
      .filter((r) => !r.retired)
      .map((r) => ({
        type: r.type,
        label: r.label,
        inverseLabel: r.inverseLabel,
        from: r.fromKinds,
        to: r.toKinds,
        description: r.description,
      })),
  };
}

export const findEntities = internalQuery({
  args: { campaignId: v.id("campaigns"), kind: v.optional(v.string()), nameContains: v.optional(v.string()) },
  handler: async (ctx, { campaignId, kind, nameContains }) => {
    const rows = kind
      ? await ctx.db.query("entities").withIndex("by_campaign_kind", (q) => q.eq("campaignId", campaignId).eq("kind", kind)).collect()
      : await ctx.db.query("entities").withIndex("by_campaign_kind", (q) => q.eq("campaignId", campaignId)).collect();
    const needle = nameContains?.toLowerCase();
    const matches = rows.filter((e) => !needle || e.name.toLowerCase().includes(needle));
    return {
      total: matches.length,
      entities: matches.slice(0, MAX_LIST).map((e) => ({ id: e._id, kind: e.kind, name: e.name })),
    };
  },
});

export const entityTip = internalQuery({
  args: { entityId: v.id("entities") },
  handler: async (ctx, { entityId }) => {
    const entity = await ctx.db.get(entityId);
    if (!entity) throw new Error(`No entity ${entityId}`);
    return { ...entityView(entity), relationships: await relationshipsOf(ctx, entityId) };
  },
});

export const entityHistory = internalQuery({
  args: { entityId: v.id("entities") },
  handler: async (ctx, { entityId }) => {
    const entries = await ctx.db.query("history").withIndex("by_entity", (q) => q.eq("entityId", entityId)).collect();
    return await Promise.all(
      entries.map(async (h) => {
        const commit = (await ctx.db.get(h.commitId))!;
        const scene = h.sceneId ? await ctx.db.get(h.sceneId) : null;
        const session = scene ? await ctx.db.get(scene.sessionId) : null;
        return {
          commit: { kind: commit.kind, reason: commit.reason, at: new Date(commit.committedAt).toISOString() },
          where: scene && session ? `Session ${session.ordinal}, scene ${scene.ordinal}: ${scene.title}` : null,
          change: h.change,
          before: h.before,
          transcript: h.transcript,
          why: h.why,
        };
      }),
    );
  },
});

function entityView(e: Doc<"entities">) {
  return { id: e._id, kind: e.kind, name: e.name, properties: e.properties };
}

async function relationshipsOf(ctx: Ctx, entityId: Id<"entities">) {
  const outgoing = await ctx.db.query("relationships").withIndex("by_from", (q) => q.eq("fromId", entityId)).collect();
  const incoming = await ctx.db.query("relationships").withIndex("by_to", (q) => q.eq("toId", entityId)).collect();
  const name = async (id: Id<"entities">) => (await ctx.db.get(id))?.name ?? "?";
  return [
    ...(await Promise.all(outgoing.map(async (r) => ({ type: r.type, direction: "out", other: await name(r.toId), otherId: r.toId })))),
    ...(await Promise.all(incoming.map(async (r) => ({ type: r.type, direction: "in", other: await name(r.fromId), otherId: r.fromId })))),
  ];
}

// ---------- structure ----------

export const structure = internalQuery({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }) => {
    const campaign = (await ctx.db.get(campaignId))!;
    const adventures = await ctx.db.query("adventures").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).collect();
    const sessions = await ctx.db.query("sessions").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).collect();
    return {
      campaign: campaign.name,
      adventures: await Promise.all(
        adventures.map(async (a) => ({
          id: a._id,
          name: a.name,
          sessions: await Promise.all(
            sessions
              .filter((s) => s.adventureId === a._id)
              .map(async (s) => {
                const debrief = await ctx.db.query("debriefs").withIndex("by_session", (q) => q.eq("sessionId", s._id)).first();
                return { id: s._id, ordinal: s.ordinal, playedOn: s.playedOn, debrief: debrief ? { id: debrief._id, status: debrief.status } : null };
              }),
          ),
        })),
      ),
    };
  },
});

export const createSession = internalMutation({
  args: {
    campaignId: v.id("campaigns"),
    adventureId: v.id("adventures"),
    playedOn: v.string(),
    scenes: v.array(v.object({ title: v.string(), summary: v.string() })),
  },
  handler: async (ctx, { campaignId, adventureId, playedOn, scenes }) => {
    const last = await ctx.db.query("sessions").withIndex("by_campaign", (q) => q.eq("campaignId", campaignId)).order("desc").first();
    const sessionId = await ctx.db.insert("sessions", { campaignId, adventureId, playedOn, ordinal: (last?.ordinal ?? 0) + 1 });
    for (const [i, s] of scenes.entries()) await ctx.db.insert("scenes", { sessionId, ordinal: i + 1, ...s });
    return sessionId;
  },
});

// ---------- debrief draft ----------

export const startDebrief = internalMutation({
  args: { sessionId: v.id("sessions"), summary: v.string(), shortSummary: v.string() },
  handler: async (ctx, { sessionId, summary, shortSummary }) => {
    const existing = await ctx.db.query("debriefs").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).first();
    if (existing?.status === "committed") throw new Error("This session's debrief is already committed. Use story_correct for later fixes.");
    if (existing) {
      await ctx.db.patch(existing._id, { summary, shortSummary });
      return existing._id;
    }
    return await ctx.db.insert("debriefs", { sessionId, status: "draft", summary, shortSummary });
  },
});

export const proposeChanges = internalMutation({
  args: { debriefId: v.id("debriefs"), changes: v.array(proposedChange) },
  handler: async (ctx, { debriefId, changes }) => {
    const { debrief, session } = await draftContext(ctx, debriefId);
    const existing = await ctx.db.query("draftChanges").withIndex("by_debrief", (q) => q.eq("debriefId", debriefId)).collect();
    const tempKinds = tempKindsOf(existing.map((c) => c.change));
    let position = existing.length;
    const results = [];
    for (const proposed of changes) {
      const scene = await ctx.db
        .query("scenes")
        .withIndex("by_session", (q) => q.eq("sessionId", session._id).eq("ordinal", proposed.scene))
        .unique();
      const error = scene ? await validateChange(ctx, session.campaignId, proposed.change, tempKinds) : `Session has no scene ${proposed.scene}.`;
      if (error) {
        results.push({ accepted: false, error });
        continue;
      }
      if (proposed.change.op === "create_entity") tempKinds.set(proposed.change.tempKey, proposed.change.kind);
      const id = await ctx.db.insert("draftChanges", {
        debriefId: debrief._id,
        sceneId: scene!._id,
        position: position++,
        change: proposed.change,
        transcript: proposed.transcript,
        why: proposed.why,
      });
      results.push({ accepted: true, changeId: id });
    }
    return results;
  },
});

export const dropChange = internalMutation({
  args: { changeId: v.id("draftChanges") },
  handler: async (ctx, { changeId }) => {
    const change = await ctx.db.get(changeId);
    if (!change) throw new Error(`No draft change ${changeId}`);
    await draftContext(ctx, change.debriefId);
    await ctx.db.delete(changeId);
  },
});

export const showDraft = internalQuery({
  args: { debriefId: v.id("debriefs") },
  handler: async (ctx, { debriefId }) => {
    const debrief = await ctx.db.get(debriefId);
    if (!debrief) throw new Error(`No debrief ${debriefId}`);
    const session = (await ctx.db.get(debrief.sessionId))!;
    const adventure = (await ctx.db.get(session.adventureId))!;
    const scenes = await ctx.db.query("scenes").withIndex("by_session", (q) => q.eq("sessionId", session._id)).collect();
    const changes = await ctx.db.query("draftChanges").withIndex("by_debrief", (q) => q.eq("debriefId", debriefId)).collect();
    const tempNames = new Map(
      changes.flatMap((c) => (c.change.op === "create_entity" ? [[c.change.tempKey, c.change.name] as const] : [])),
    );
    const label = async (ref: string) => {
      if (ref.startsWith("$")) return { name: tempNames.get(ref.slice(1)) ?? ref, isNew: true };
      const e = await ctx.db.get(ref as Id<"entities">);
      return { name: e?.name ?? ref, isNew: false, kind: e?.kind };
    };
    const describe = async (c: Doc<"draftChanges">) => {
      const ch = c.change;
      switch (ch.op) {
        case "create_entity":
          return { op: ch.op, kind: ch.kind, subject: ch.name, isNew: true, properties: ch.properties };
        case "set_property": {
          const subject = await label(ch.entity);
          const before = subject.isNew ? undefined : (await ctx.db.get(ch.entity as Id<"entities">))?.properties[ch.key];
          return { op: ch.op, subject: subject.name, kind: subject.kind, key: ch.key, before, after: ch.value };
        }
        case "relate":
        case "unrelate":
          return { op: ch.op, type: ch.type, subject: (await label(ch.from)).name, object: (await label(ch.to)).name };
      }
    };
    return {
      debriefId,
      status: debrief.status,
      title: `Session ${session.ordinal} · ${adventure.name}`,
      playedOn: session.playedOn,
      summary: debrief.summary,
      shortSummary: debrief.shortSummary,
      scenes: await Promise.all(
        scenes.map(async (s) => ({
          ordinal: s.ordinal,
          title: s.title,
          summary: s.summary,
          changes: await Promise.all(
            changes
              .filter((c) => c.sceneId === s._id)
              .map(async (c) => ({ changeId: c._id, ...(await describe(c)), transcript: c.transcript, why: c.why })),
          ),
        })),
      ),
    };
  },
});

// ---------- commits ----------

export const commitDebrief = internalMutation({
  args: { debriefId: v.id("debriefs") },
  handler: async (ctx, { debriefId }) => {
    const { debrief, session } = await draftContext(ctx, debriefId);
    const changes = await ctx.db.query("draftChanges").withIndex("by_debrief", (q) => q.eq("debriefId", debriefId)).collect();
    const commitId = await ctx.db.insert("commits", {
      campaignId: session.campaignId,
      kind: "debrief",
      reason: `Debrief of session ${session.ordinal}`,
      debriefId,
      committedAt: Date.now(),
    });
    await applyAll(ctx, session.campaignId, commitId, changes);
    for (const c of changes) await ctx.db.delete(c._id);
    await ctx.db.patch(debriefId, { status: "committed", commitId });
    return { commitId, applied: changes.length, shortSummary: debrief.shortSummary };
  },
});

export const commitCorrection = internalMutation({
  args: {
    campaignId: v.id("campaigns"),
    reason: v.string(),
    changes: v.array(v.object({ change: changeOp, why: v.string(), sceneId: v.optional(v.id("scenes")) })),
  },
  handler: async (ctx, { campaignId, reason, changes }) => {
    const tempKinds = new Map<string, string>();
    for (const c of changes) {
      const error = await validateChange(ctx, campaignId, c.change, tempKinds);
      if (error) throw new Error(`Correction rejected, nothing applied: ${error}`);
      if (c.change.op === "create_entity") tempKinds.set(c.change.tempKey, c.change.kind);
    }
    const commitId = await ctx.db.insert("commits", { campaignId, kind: "correction", reason, committedAt: Date.now() });
    await applyAll(ctx, campaignId, commitId, changes);
    return { commitId, applied: changes.length };
  },
});

export const schemaOp = v.union(
  v.object({ op: v.literal("add_kind"), kind: v.string(), label: v.string(), description: v.string() }),
  v.object({
    op: v.literal("add_property"),
    kind: v.string(),
    key: v.string(),
    valueType,
    enumValues: v.optional(v.array(v.string())),
    description: v.string(),
  }),
  v.object({ op: v.literal("retire_property"), kind: v.string(), key: v.string() }),
  v.object({
    op: v.literal("add_relationship_type"),
    type: v.string(),
    label: v.string(),
    inverseLabel: v.string(),
    fromKinds: v.array(v.string()),
    toKinds: v.array(v.string()),
    description: v.string(),
  }),
);

export const changeSchema = internalMutation({
  args: { campaignId: v.id("campaigns"), reason: v.string(), ops: v.array(schemaOp), kind: v.optional(v.literal("seed")) },
  handler: async (ctx, { campaignId, reason, ops, kind }) => {
    const commitId = await ctx.db.insert("commits", { campaignId, kind: kind ?? "schema", reason, committedAt: Date.now() });
    for (const op of ops) {
      switch (op.op) {
        case "add_kind":
          await ctx.db.insert("kindDefinitions", { campaignId, kind: op.kind, label: op.label, description: op.description });
          break;
        case "add_property":
          await ctx.db.insert("propertyDefinitions", {
            campaignId,
            kind: op.kind,
            key: op.key,
            valueType: op.valueType,
            enumValues: op.enumValues,
            description: op.description,
            retired: false,
          });
          break;
        case "retire_property": {
          const def = await propertyDefinition(ctx, campaignId, op.kind, op.key);
          if (!def) throw new Error(`No property ${op.kind}.${op.key}`);
          await ctx.db.patch(def._id, { retired: true });
          break;
        }
        case "add_relationship_type":
          await ctx.db.insert("relationshipDefinitions", { campaignId, ...op, op: undefined, retired: false } as never);
          break;
      }
      await ctx.db.insert("history", { campaignId, commitId, change: op, why: reason });
    }
    return { commitId };
  },
});

// ---------- validation and application ----------

async function draftContext(ctx: MutationCtx, debriefId: Id<"debriefs">) {
  const debrief = await ctx.db.get(debriefId);
  if (!debrief) throw new Error(`No debrief ${debriefId}`);
  if (debrief.status !== "draft") throw new Error("This debrief is committed. Use story_correct for later fixes.");
  const session = (await ctx.db.get(debrief.sessionId))!;
  return { debrief, session };
}

function tempKindsOf(changes: Change[]) {
  return new Map(changes.flatMap((c) => (c.op === "create_entity" ? [[c.tempKey, c.kind] as const] : [])));
}

async function propertyDefinition(ctx: Ctx, campaignId: Id<"campaigns">, kind: string, key: string) {
  return await ctx.db
    .query("propertyDefinitions")
    .withIndex("by_campaign_kind", (q) => q.eq("campaignId", campaignId).eq("kind", kind).eq("key", key))
    .unique();
}

async function kindOf(ctx: Ctx, ref: string, tempKinds: Map<string, string>): Promise<string | null> {
  if (ref.startsWith("$")) return tempKinds.get(ref.slice(1)) ?? null;
  const id = ctx.db.normalizeId("entities", ref);
  return id ? ((await ctx.db.get(id))?.kind ?? null) : null;
}

async function validateValue(ctx: Ctx, campaignId: Id<"campaigns">, kind: string, key: string, value: unknown) {
  const def = await propertyDefinition(ctx, campaignId, kind, key);
  if (!def || def.retired) {
    const allowed = (await describeSchemaOf(ctx, campaignId)).kinds.find((k) => k.kind === kind)?.properties.map((p) => p.key) ?? [];
    return `"${key}" is not a property of ${kind}. Allowed: ${allowed.join(", ")}. A new property needs a deliberate schema_change.`;
  }
  if (def.valueType === "number" && typeof value !== "number") return `${kind}.${key} must be a number.`;
  if (def.valueType === "text" && typeof value !== "string") return `${kind}.${key} must be text.`;
  if (def.valueType === "enum" && !def.enumValues?.includes(value as string))
    return `${kind}.${key} must be one of: ${def.enumValues?.join(", ")}.`;
  return null;
}

async function validateChange(ctx: Ctx, campaignId: Id<"campaigns">, change: Change, tempKinds: Map<string, string>) {
  switch (change.op) {
    case "create_entity": {
      const kindDef = await ctx.db
        .query("kindDefinitions")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId).eq("kind", change.kind))
        .unique();
      if (!kindDef) return `Unknown kind "${change.kind}".`;
      if (tempKinds.has(change.tempKey)) return `tempKey "${change.tempKey}" is already used in this draft.`;
      const twin = await ctx.db
        .query("entities")
        .withIndex("by_campaign_name", (q) => q.eq("campaignId", campaignId).eq("name", change.name))
        .first();
      if (twin) return `"${change.name}" already exists (${twin._id}). Change it instead of creating a duplicate.`;
      for (const [key, value] of Object.entries(change.properties)) {
        const error = await validateValue(ctx, campaignId, change.kind, key, value);
        if (error) return error;
      }
      return null;
    }
    case "set_property": {
      const kind = await kindOf(ctx, change.entity, tempKinds);
      if (!kind) return `Unknown entity "${change.entity}". Use an entity id or $tempKey from this draft.`;
      return await validateValue(ctx, campaignId, kind, change.key, change.value);
    }
    case "relate":
    case "unrelate": {
      const def = await ctx.db
        .query("relationshipDefinitions")
        .withIndex("by_campaign_type", (q) => q.eq("campaignId", campaignId).eq("type", change.type))
        .unique();
      if (!def || def.retired) return `Unknown relationship type "${change.type}".`;
      const fromKind = await kindOf(ctx, change.from, tempKinds);
      const toKind = await kindOf(ctx, change.to, tempKinds);
      if (!fromKind || !toKind) return `Unknown entity in relationship.`;
      if (!def.fromKinds.includes(fromKind) || !def.toKinds.includes(toKind))
        return `"${change.type}" connects ${def.fromKinds.join("/")} → ${def.toKinds.join("/")}, not ${fromKind} → ${toKind}.`;
      return null;
    }
  }
}

type Applicable = { change: Change; why: string; sceneId?: Id<"scenes">; transcript?: Infer<typeof transcriptRef> };

async function applyAll(ctx: MutationCtx, campaignId: Id<"campaigns">, commitId: Id<"commits">, changes: Applicable[]) {
  const created = new Map<string, Id<"entities">>();
  const resolve = (ref: string) => (ref.startsWith("$") ? created.get(ref.slice(1))! : (ref as Id<"entities">));
  for (const { change, why, sceneId, transcript } of changes) {
    const log = (entityId: Id<"entities">, before?: unknown) =>
      ctx.db.insert("history", { campaignId, commitId, entityId, sceneId, change, before, transcript, why });
    switch (change.op) {
      case "create_entity": {
        const id = await ctx.db.insert("entities", { campaignId, kind: change.kind, name: change.name, properties: change.properties });
        created.set(change.tempKey, id);
        await log(id);
        break;
      }
      case "set_property": {
        const id = resolve(change.entity);
        const entity = (await ctx.db.get(id))!;
        await ctx.db.patch(id, { properties: { ...entity.properties, [change.key]: change.value } });
        await log(id, entity.properties[change.key]);
        break;
      }
      case "relate": {
        const fromId = resolve(change.from);
        const toId = resolve(change.to);
        await ctx.db.insert("relationships", { campaignId, type: change.type, fromId, toId });
        await log(fromId);
        await log(toId);
        break;
      }
      case "unrelate": {
        const fromId = resolve(change.from);
        const toId = resolve(change.to);
        const edge = (await ctx.db.query("relationships").withIndex("by_from", (q) => q.eq("fromId", fromId)).collect()).find(
          (r) => r.toId === toId && r.type === change.type,
        );
        if (edge) await ctx.db.delete(edge._id);
        await log(fromId);
        await log(toId);
        break;
      }
    }
  }
}
