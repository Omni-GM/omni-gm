// PROTOTYPE — throwaway. In-memory story-state store that enforces the spec's domain rules.
// Every surface (A-D) is a different set of MCP tools over this one store.

export const BASES = ["narrated", "npc_said", "rumor", "player_guess", "player_plan", "game_master"] as const;
export type Basis = (typeof BASES)[number];
const GUESS_BASES: Basis[] = ["player_guess", "player_plan"];
const GUESS_KINDS = ["thread", "character_goal"];

export const FRAME_FIELDS = [
  "goal",
  "stakes",
  "timeframe",
  "pressure",
  "finale",
  "moves_main_plot",
  "pulls_in",
  "next_session_starts",
] as const;
export type FrameField = (typeof FRAME_FIELDS)[number];
export type Frame = Partial<Record<FrameField, string>>;

export type Source = { quote: string; at?: string };
export type Change =
  | { op: "new"; tempKey?: string; kind: string; name: string; aliases?: string[]; properties?: Record<string, unknown> }
  | { op: "update"; entity: string; properties?: Record<string, unknown>; addAliases?: string[] }
  | { op: "relate" | "unrelate"; type: string; from: string; to: string };
export type ChangeRecord = { change: Change; basis: Basis[]; sources: Source[]; why: string; scene?: number };

type PropertyDef = { key: string; type: "text" | "enum" | "number"; enumValues?: string[]; description: string; retired?: boolean };
type KindDef = { kind: string; label: string; description: string; properties: PropertyDef[] };
type RelationshipDef = { type: string; label: string; inverseLabel: string; from: string[]; to: string[]; description: string };
export type Scene = { ordinal: number; title: string; start: string; end?: string; place: string; summary: string };
export type Transcript = { text: string; bytes: number; via: string; uploadedAt: string };
export type Session = { id: string; ordinal: number; adventureId: string; playedOn: string; transcript?: Transcript; scenes: Scene[] };
export type Entity = { id: string; kind: string; name: string; aliases: string[]; properties: Record<string, unknown> };
export type Relationship = { type: string; from: string; to: string };
export type DraftChange = ChangeRecord & { id: string };
export type Debrief = { id: string; sessionId: string; status: "draft" | "committed"; summary?: string; changes: DraftChange[]; commitId?: string };
export type Commit = { id: string; kind: "seed" | "debrief" | "correction" | "schema" | "frame"; reason: string };
export type HistoryEntry = { commitId: string; entityId?: string; sessionId?: string; change: unknown; before?: unknown } & Partial<ChangeRecord>;

export type State = {
  campaign: string;
  adventures: { id: string; name: string; current: boolean; frame: Frame }[];
  sessions: Session[];
  schema: { kinds: KindDef[]; relationshipTypes: RelationshipDef[] };
  entities: Entity[];
  relationships: Relationship[];
  debriefs: Debrief[];
  commits: Commit[];
  history: HistoryEntry[];
  uploads: Record<string, string>;
  nextId: number;
};

export class Rejection extends Error {}

const reject = (message: string): never => {
  throw new Rejection(message);
};

export class Store {
  constructor(public state: State) {}

  private id(prefix: string) {
    return `${prefix}${this.state.nextId++}`;
  }

  // ---------- structure ----------

  currentAdventure() {
    return this.state.adventures.find((a) => a.current) ?? reject("No current adventure.");
  }

  session(ref: string) {
    const ordinal = Number(String(ref).replace(/^session[:_ ]?|^s/i, ""));
    return (
      this.state.sessions.find((s) => s.id === ref || s.ordinal === ordinal) ??
      reject(`No session "${ref}". Sessions: ${this.state.sessions.map((s) => `${s.id} (session ${s.ordinal}, ${s.playedOn})`).join(", ")}.`)
    );
  }

  createSession(playedOn: string, adventureId?: string) {
    const adventure = adventureId ? this.adventure(adventureId) : this.currentAdventure();
    const ordinal = Math.max(0, ...this.state.sessions.map((s) => s.ordinal)) + 1;
    const session: Session = { id: `s${ordinal}`, ordinal, adventureId: adventure.id, playedOn, scenes: [] };
    this.state.sessions.push(session);
    return session;
  }

  adventure(ref: string) {
    return this.state.adventures.find((a) => a.id === ref || a.name === ref) ?? reject(`No adventure "${ref}".`);
  }

  attachTranscript(sessionRef: string, text: string, via: string) {
    const session = this.session(sessionRef);
    if (!text.trim()) reject("The transcript is empty.");
    session.transcript = { text, bytes: Buffer.byteLength(text), via, uploadedAt: new Date().toISOString() };
    return session;
  }

  setScenes(sessionRef: string, scenes: Omit<Scene, "ordinal">[]) {
    const session = this.session(sessionRef);
    if (!session.transcript) reject(`Session ${session.ordinal} has no transcript yet. Upload it first.`);
    if (this.debriefOf(session.id)?.status === "committed") reject("This session's debrief is committed; its scenes are fixed.");
    if (scenes.length === 0) reject("Give at least one scene.");
    const starts = scenes.map((s) => seconds(s.start));
    if (starts.some((s) => Number.isNaN(s))) reject('Scene start must be a timestamp like "0:14:02".');
    if (starts.some((s, i) => i > 0 && s <= starts[i - 1]!)) reject("Scenes must be in order, each starting after the previous one.");
    session.scenes = scenes.map((s, i) => ({ ...s, ordinal: i + 1 }));
    return session;
  }

  // ---------- schema ----------

  kindDef(kind: string) {
    return this.state.schema.kinds.find((k) => k.kind === kind);
  }

  describeSchema() {
    return {
      kinds: this.state.schema.kinds.map((k) => ({
        kind: k.kind,
        description: k.description,
        properties: k.properties.filter((p) => !p.retired).map(({ retired, ...p }) => p),
      })),
      relationshipTypes: this.state.schema.relationshipTypes,
      bases: BASES,
      basisRule: "player_guess and player_plan may only touch a thread or a character_goal.",
    };
  }

  changeSchema(reason: string, ops: SchemaOp[]) {
    if (!reason.trim()) reject("A schema change needs the GM's reason.");
    const commit = this.commit("schema", reason);
    for (const op of ops) {
      if (op.op === "add_property") {
        const kind = this.kindDef(op.kind) ?? reject(`Unknown kind "${op.kind}".`);
        if (kind.properties.some((p) => p.key === op.key)) reject(`${op.kind}.${op.key} already exists.`);
        kind.properties.push({ key: op.key, type: op.type, enumValues: op.enumValues, description: op.description });
      } else if (op.op === "retire_property") {
        const kind = this.kindDef(op.kind) ?? reject(`Unknown kind "${op.kind}".`);
        const prop = kind.properties.find((p) => p.key === op.key) ?? reject(`No property ${op.kind}.${op.key}.`);
        prop.retired = true;
      } else {
        if (this.state.schema.relationshipTypes.some((r) => r.type === op.type)) reject(`Relationship type "${op.type}" exists.`);
        this.state.schema.relationshipTypes.push({ type: op.type, label: op.label, inverseLabel: op.inverseLabel, from: op.from, to: op.to, description: op.description });
      }
      this.state.history.push({ commitId: commit.id, change: op, why: reason });
    }
    return { commitId: commit.id, applied: ops.length };
  }

  // ---------- entities ----------

  entity(ref: string) {
    const needle = ref.toLowerCase();
    return (
      this.state.entities.find((e) => e.id === ref) ??
      this.state.entities.find((e) => e.name.toLowerCase() === needle || e.aliases.some((a) => a.toLowerCase() === needle)) ??
      reject(`No entity "${ref}". Look it up first and use its id.`)
    );
  }

  entityView(e: Entity, withHistory = false) {
    const name = (id: string) => this.state.entities.find((x) => x.id === id)?.name ?? id;
    return {
      id: e.id,
      kind: e.kind,
      name: e.name,
      aliases: e.aliases,
      properties: e.properties,
      relationships: [
        ...this.state.relationships.filter((r) => r.from === e.id).map((r) => ({ type: r.type, to: name(r.to), toId: r.to })),
        ...this.state.relationships.filter((r) => r.to === e.id).map((r) => ({ type: this.inverse(r.type), to: name(r.from), toId: r.from })),
      ],
      history: withHistory ? this.historyOf(e.id) : undefined,
    };
  }

  private inverse(type: string) {
    return this.state.schema.relationshipTypes.find((r) => r.type === type)?.inverseLabel ?? `${type} (inverse)`;
  }

  historyOf(entityId: string) {
    return this.state.history
      .filter((h) => h.entityId === entityId)
      .map((h) => ({
        commit: this.state.commits.find((c) => c.id === h.commitId)?.reason,
        session: h.sessionId ? this.session(h.sessionId).ordinal : undefined,
        scene: h.scene,
        change: h.change,
        before: h.before,
        basis: h.basis,
        sources: h.sources,
        why: h.why,
      }));
  }

  listEntities(kind?: string, nameContains?: string) {
    const needle = nameContains?.toLowerCase();
    return this.state.entities
      .filter((e) => !kind || e.kind === kind)
      .filter((e) => !needle || [e.name, ...e.aliases].some((n) => n.toLowerCase().includes(needle)))
      .map((e) => ({ id: e.id, kind: e.kind, name: e.name }));
  }

  // ---------- validation ----------

  private kindOfRef(ref: string, temp: Map<string, string>) {
    if (ref.startsWith("$")) return temp.get(ref.slice(1)) ?? reject(`Unknown tempKey "${ref}" in this batch or draft.`);
    return this.entity(ref).kind;
  }

  private validateProperties(kind: string, properties: Record<string, unknown> = {}) {
    const def = this.kindDef(kind) ?? reject(`Unknown kind "${kind}". Kinds: ${this.state.schema.kinds.map((k) => k.kind).join(", ")}.`);
    for (const [key, value] of Object.entries(properties)) {
      const prop = def.properties.find((p) => p.key === key && !p.retired);
      if (!prop)
        reject(
          `"${key}" is not a property of ${kind}. Allowed: ${def.properties.filter((p) => !p.retired).map((p) => p.key).join(", ")}. Relationships are separate changes. A new property needs a deliberate schema change.`,
        );
      if (prop!.type === "number" && typeof value !== "number") reject(`${kind}.${key} must be a number.`);
      if (prop!.type === "text" && typeof value !== "string") reject(`${kind}.${key} must be text.`);
      if (prop!.type === "enum" && !prop!.enumValues!.includes(value as string)) reject(`${kind}.${key} must be one of: ${prop!.enumValues!.join(", ")}.`);
    }
  }

  validate(record: ChangeRecord, temp: Map<string, string>) {
    const { change, basis, sources, why } = record;
    if (!basis?.length) reject(`Every change needs a basis: one or more of ${BASES.join(", ")}.`);
    if (!sources?.length || sources.some((s) => !s.quote?.trim())) reject("Every change needs at least one source with a verbatim quote.");
    if (!why?.trim()) reject("Every change needs a why.");
    let targetKind: string;
    switch (change.op) {
      case "new": {
        targetKind = change.kind;
        this.validateProperties(change.kind, change.properties);
        const twin = this.state.entities.find((e) => [e.name, ...e.aliases].some((n) => n.toLowerCase() === change.name.toLowerCase()));
        if (twin) reject(`"${change.name}" already exists as ${twin.kind} ${twin.id}. Update it instead of creating a duplicate.`);
        if (change.tempKey && temp.has(change.tempKey)) reject(`tempKey "${change.tempKey}" is already used.`);
        break;
      }
      case "update":
        targetKind = this.kindOfRef(change.entity, temp);
        this.validateProperties(targetKind, change.properties);
        break;
      default: {
        const def =
          this.state.schema.relationshipTypes.find((r) => r.type === change.type) ??
          reject(`Unknown relationship type "${change.type}". Types: ${this.state.schema.relationshipTypes.map((r) => r.type).join(", ")}.`);
        const from = this.kindOfRef(change.from, temp);
        const to = this.kindOfRef(change.to, temp);
        if (!def.from.includes(from) || !def.to.includes(to)) reject(`"${change.type}" connects ${def.from.join("/")} -> ${def.to.join("/")}, not ${from} -> ${to}.`);
        targetKind = from;
      }
    }
    if (basis.some((b) => GUESS_BASES.includes(b)) && !GUESS_KINDS.includes(targetKind))
      reject(`A player guess or plan may only touch a thread or a character_goal, not a ${targetKind}. Record it on a thread instead.`);
    if (change.op === "new" && change.tempKey) temp.set(change.tempKey, change.kind);
  }

  // ---------- debrief ----------

  debriefOf(sessionId: string) {
    return this.state.debriefs.find((d) => d.sessionId === sessionId);
  }

  openDebrief(sessionRef: string, summary?: string) {
    const session = this.session(sessionRef);
    if (session.scenes.length === 0) reject(`Session ${session.ordinal} has no scenes yet. Split the transcript into scenes first.`);
    let debrief = this.debriefOf(session.id);
    if (debrief?.status === "committed") reject(`Session ${session.ordinal}'s debrief is committed. Fix the committed state with a correction instead.`);
    if (!debrief) {
      debrief = { id: `d${session.ordinal}`, sessionId: session.id, status: "draft", changes: [] };
      this.state.debriefs.push(debrief);
    }
    if (summary !== undefined) debrief.summary = summary;
    return debrief;
  }

  private draftTemp(debrief: Debrief) {
    return new Map(debrief.changes.flatMap((c) => (c.change.op === "new" && c.change.tempKey ? [[c.change.tempKey, c.change.kind] as const] : [])));
  }

  addToDraft(sessionRef: string, records: ChangeRecord[]) {
    const debrief = this.openDebrief(sessionRef);
    const session = this.session(debrief.sessionId);
    const temp = this.draftTemp(debrief);
    return records.map((record) => {
      try {
        if (!session.scenes.some((s) => s.ordinal === record.scene)) reject(`Session ${session.ordinal} has no scene ${record.scene}. Scenes: 1-${session.scenes.length}.`);
        this.validate(record, temp);
        const id = this.id("c");
        debrief.changes.push({ ...record, id });
        return { accepted: true as const, changeId: id };
      } catch (e) {
        if (e instanceof Rejection) return { accepted: false as const, error: e.message };
        throw e;
      }
    });
  }

  dropFromDraft(sessionRef: string, changeIds: string[]) {
    const debrief = this.openDebrief(sessionRef);
    const unknown = changeIds.filter((id) => !debrief.changes.some((c) => c.id === id));
    if (unknown.length) reject(`No draft changes ${unknown.join(", ")}.`);
    debrief.changes = debrief.changes.filter((c) => !changeIds.includes(c.id));
    return { dropped: changeIds };
  }

  showDraft(sessionRef: string) {
    const session = this.session(sessionRef);
    const debrief = this.debriefOf(session.id);
    return {
      session: session.ordinal,
      status: debrief?.status ?? "none",
      summary: debrief?.summary,
      scenes: session.scenes.map((s) => ({
        scene: s.ordinal,
        title: s.title,
        changes: (debrief?.changes ?? []).filter((c) => c.scene === s.ordinal).map((c) => ({ changeId: c.id, ...c, id: undefined, scene: undefined })),
      })),
    };
  }

  commitDebrief(sessionRef: string) {
    const debrief = this.openDebrief(sessionRef);
    if (debrief.changes.length === 0) reject("The draft is empty.");
    const commit = this.commit("debrief", `Debrief of session ${this.session(debrief.sessionId).ordinal}`);
    this.apply(commit.id, debrief.changes, debrief.sessionId);
    debrief.status = "committed";
    debrief.commitId = commit.id;
    return { commitId: commit.id, applied: debrief.changes.length };
  }

  // ---------- commits outside a debrief ----------

  commitChanges(reason: string, records: ChangeRecord[]) {
    if (!reason?.trim()) reject("A change outside a debrief needs the GM's reason.");
    if (!records.length) reject("No changes given.");
    const temp = new Map<string, string>();
    records.forEach((r, i) => {
      try {
        this.validate(r, temp);
      } catch (e) {
        if (e instanceof Rejection) reject(`Change ${i + 1} rejected, nothing applied: ${e.message}`);
        throw e;
      }
    });
    const commit = this.commit("correction", reason);
    this.apply(commit.id, records);
    return { commitId: commit.id, applied: records.length };
  }

  updateFrame(reason: string, fields: Frame, adventureId?: string) {
    const adventure = adventureId ? this.adventure(adventureId) : this.currentAdventure();
    const unknown = Object.keys(fields).filter((k) => !FRAME_FIELDS.includes(k as FrameField));
    if (unknown.length) reject(`Unknown frame fields ${unknown.join(", ")}. Fields: ${FRAME_FIELDS.join(", ")}.`);
    const commit = this.commit("frame", reason || "Frame update");
    this.state.history.push({ commitId: commit.id, change: { frame: fields }, before: pick(adventure.frame, Object.keys(fields)), why: reason });
    adventure.frame = { ...adventure.frame, ...fields };
    return { adventure: adventure.name, frame: adventure.frame };
  }

  private commit(kind: Commit["kind"], reason: string) {
    const commit = { id: this.id("k"), kind, reason };
    this.state.commits.push(commit);
    return commit;
  }

  private apply(commitId: string, records: ChangeRecord[], sessionId?: string) {
    const created = new Map<string, string>();
    const resolve = (ref: string) => (ref.startsWith("$") ? created.get(ref.slice(1))! : this.entity(ref).id);
    for (const record of records) {
      const { change } = record;
      const log = (entityId: string, before?: unknown) => this.state.history.push({ ...record, commitId, entityId, sessionId, before });
      if (change.op === "new") {
        const entity: Entity = { id: this.id("e"), kind: change.kind, name: change.name, aliases: change.aliases ?? [], properties: change.properties ?? {} };
        this.state.entities.push(entity);
        if (change.tempKey) created.set(change.tempKey, entity.id);
        log(entity.id);
      } else if (change.op === "update") {
        const entity = this.entity(resolve(change.entity));
        log(entity.id, pick(entity.properties, Object.keys(change.properties ?? {})));
        entity.properties = { ...entity.properties, ...change.properties };
        entity.aliases = [...entity.aliases, ...(change.addAliases ?? [])];
      } else {
        const from = resolve(change.from);
        const to = resolve(change.to);
        if (change.op === "relate") this.state.relationships.push({ type: change.type, from, to });
        else this.state.relationships = this.state.relationships.filter((r) => !(r.type === change.type && r.from === from && r.to === to));
        log(from);
        log(to);
      }
    }
  }

  // ---------- reads ----------

  overview() {
    return {
      campaign: this.state.campaign,
      adventures: this.state.adventures.map((a) => ({
        id: a.id,
        name: a.name,
        current: a.current,
        sessions: this.state.sessions
          .filter((s) => s.adventureId === a.id)
          .map((s) => ({
            id: s.id,
            ordinal: s.ordinal,
            playedOn: s.playedOn,
            transcript: s.transcript ? `${s.transcript.bytes} bytes` : "none",
            scenes: s.scenes.length,
            debrief: this.debriefOf(s.id)?.status ?? "none",
          })),
      })),
      entityCounts: Object.fromEntries(this.state.schema.kinds.map((k) => [k.kind, this.state.entities.filter((e) => e.kind === k.kind).length])),
    };
  }

  transcript(sessionRef: string, from?: string, to?: string, contains?: string) {
    const session = this.session(sessionRef);
    if (!session.transcript) reject(`Session ${session.ordinal} has no transcript.`);
    const utterances = parseUtterances(session.transcript!.text);
    const lo = from ? seconds(from) : 0;
    const hi = to ? seconds(to) : Infinity;
    const needle = contains?.toLowerCase();
    const hits = utterances.filter((u) => u.seconds >= lo && u.seconds <= hi && (!needle || u.text.toLowerCase().includes(needle)));
    const shown = hits.slice(0, 80);
    return { session: session.ordinal, utterances: shown.map((u) => `[${u.at}] ${u.speaker}: ${u.text}`), more: hits.length - shown.length };
  }

  find(query: string, types?: string[], kinds?: string[], limit = 10) {
    const terms = tokens(query);
    if (terms.length === 0) reject("Give a query with at least one meaningful word.");
    const wants = (t: string) => !types?.length || types.includes(t);
    const hits: { ref: string; type: string; title: string; snippet: string; score: number }[] = [];
    const score = (text: string) => terms.filter((t) => text.toLowerCase().includes(t)).length;
    if (wants("entity"))
      for (const e of this.state.entities) {
        if (kinds?.length && !kinds.includes(e.kind)) continue;
        const text = [e.name, ...e.aliases, ...Object.values(e.properties).map(String)].join(" · ");
        const s = score(text) + score(e.name) * 2;
        if (s) hits.push({ ref: `entity:${e.id}`, type: `entity/${e.kind}`, title: e.name, snippet: clip(text), score: s });
      }
    for (const session of this.state.sessions) {
      if (wants("scene"))
        for (const scene of session.scenes) {
          const text = `${scene.title} · ${scene.place} · ${scene.summary}`;
          const s = score(text);
          if (s) hits.push({ ref: `scene:${session.id}/${scene.ordinal}`, type: "scene", title: `Session ${session.ordinal}, scene ${scene.ordinal}: ${scene.title}`, snippet: clip(text), score: s });
        }
      if (wants("transcript") && session.transcript)
        for (const u of parseUtterances(session.transcript.text)) {
          const s = score(u.text);
          if (s) hits.push({ ref: `transcript:${session.id}@${u.at}`, type: "transcript", title: `Session ${session.ordinal} [${u.at}] ${u.speaker}`, snippet: clip(u.text), score: s });
        }
    }
    if (wants("source"))
      for (const h of this.state.history) {
        if (!h.sources || !h.entityId) continue;
        const text = `${h.sources.map((s) => s.quote).join(" / ")} · ${h.why}`;
        const s = score(text);
        const entity = this.state.entities.find((e) => e.id === h.entityId);
        if (s && entity) hits.push({ ref: `entity:${entity.id}`, type: "source", title: `${entity.name} (basis ${h.basis?.join("+")})`, snippet: clip(text), score: s });
      }
    hits.sort((a, b) => b.score - a.score);
    return { query, hits: hits.slice(0, limit), total: hits.length };
  }

  get(ref: string) {
    const [type, rest = ""] = ref.includes(":") ? (ref.split(/:(.*)/s) as [string, string]) : [ref, ""];
    switch (type) {
      case "overview":
        return this.overview();
      case "schema":
        return this.describeSchema();
      case "frame": {
        const adventure = rest ? this.adventure(rest) : this.currentAdventure();
        return { adventure: adventure.name, frame: adventure.frame };
      }
      case "entity":
        return this.entityView(this.entity(rest), true);
      case "session": {
        const session = this.session(rest);
        return { ...session, transcript: session.transcript ? { bytes: session.transcript.bytes, via: session.transcript.via } : null, debrief: this.debriefOf(session.id)?.status ?? "none" };
      }
      case "scene": {
        const [sessionRef, ordinal] = rest.split("/");
        const session = this.session(sessionRef!);
        const scene = session.scenes.find((s) => s.ordinal === Number(ordinal)) ?? reject(`No scene ${ordinal} in session ${session.ordinal}.`);
        const next = session.scenes.find((s) => s.ordinal === scene.ordinal + 1);
        return { ...scene, transcript: session.transcript ? this.transcript(session.id, scene.start, scene.end ?? next?.start).utterances : [] };
      }
      case "transcript": {
        const [sessionRef, at] = rest.split("@");
        const session = this.session(sessionRef!);
        if (!at) return this.transcript(session.id);
        const around = seconds(at);
        return this.transcript(session.id, stamp(Math.max(0, around - 60)), stamp(around + 90));
      }
      case "debrief":
        return this.showDraft(rest);
      default:
        return this.entityView(this.entity(ref), true);
    }
  }
}

export type SchemaOp =
  | { op: "add_property"; kind: string; key: string; type: "text" | "enum" | "number"; enumValues?: string[]; description: string }
  | { op: "retire_property"; kind: string; key: string }
  | { op: "add_relationship_type"; type: string; label: string; inverseLabel: string; from: string[]; to: string[]; description: string };

// ---------- helpers ----------

const STOP = new Set("the a an and or of to in on at for what who how do does did is are was were about with from that this they them their players party know knows".split(" "));

function tokens(query: string) {
  return [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3 && !STOP.has(t)))];
}

function clip(text: string) {
  return text.length > 220 ? `${text.slice(0, 217)}...` : text;
}

function pick(obj: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}

export function seconds(at: string) {
  const parts = at.trim().replace(/[\[\]]/g, "").split(":").map(Number);
  if (parts.some((p) => Number.isNaN(p))) return NaN;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function stamp(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function parseUtterances(text: string) {
  const out: { speaker: string; at: string; seconds: number; text: string }[] = [];
  const re = /\*\*(.+?)\*\*\s*_\[(\d+:\d{2}:\d{2})\]_\s*\n([\s\S]*?)(?=\n\*\*|$)/g;
  for (const m of text.matchAll(re)) out.push({ speaker: m[1]!, at: m[2]!, seconds: seconds(m[2]!), text: m[3]!.trim() });
  return out;
}
