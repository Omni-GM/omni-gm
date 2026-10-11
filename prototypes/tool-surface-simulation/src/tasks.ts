// PROTOTYPE — throwaway. The six v1 tasks: GM prompts, seed state, and the gold checks the scorer runs.
import { readFileSync } from "node:fs";
import { parseUtterances, seconds, type Entity, type State } from "./domain";
import { seedAfterSession3, seedBeforeSession3, seedSession3Uploaded, transcriptFile, goldScenes3 } from "./campaign";

export type Evidence = {
  final: State;
  afterTurn1: State;
  seed: State;
  calls: CallLog[];
  answer: string;
  modelOutput: string;
};
export type CallLog = { tool?: string; event?: string; args?: any; outcome?: string; partialRejections?: number; via?: string; name?: string };
export type Check = { name: string; pass: boolean; critical: boolean; ruleBreak?: boolean };

export type Task = {
  id: string;
  title: string;
  turns: string[];
  seed: () => State;
  needsTranscriptFile?: boolean;
  expectedSkill?: string;
  checks: (e: Evidence) => Check[];
};

const TRANSCRIPT_3 = readFileSync(transcriptFile(3), "utf8");
const away = "\n\n(I'm away from the keyboard for this one, so don't wait for answers from me. Do what you can and tell me what's left.)";

const byName = (s: State, re: RegExp) => s.entities.filter((e) => [e.name, ...e.aliases].some((n) => re.test(n)));
const one = (s: State, re: RegExp) => byName(s, re)[0];
const propsText = (e?: Entity) => (e ? Object.values(e.properties).join(" · ") : "");
const newCommits = (e: Evidence) => e.final.commits.filter((c) => !e.seed.commits.some((s) => s.id === c.id));
const newHistory = (e: Evidence) => e.final.history.filter((h) => newCommits(e).some((c) => c.id === h.commitId));
const writes = (e: Evidence) => e.calls.filter((c) => c.tool && WRITE_TOOLS.has(c.tool) && c.outcome === "ok");
export const WRITE_TOOLS = new Set([
  "debrief", "adventure", "story_correct", "schema_change", "create_session", "get_upload_url", "set_scenes", "draft_new_entity", "draft_update_entity",
  "draft_relate", "draft_unrelate", "draft_drop", "draft_commit", "update_frame", "correct_story", "change_schema", "session_create", "transcript_upload_url",
  "scenes_set", "debrief_add", "debrief_drop", "debrief_commit", "story_commit", "frame_update",
]);
const norm = (t: string) => t.toLowerCase().replace(/[“”"'‘’]/g, "").replace(/\s+/g, " ").trim();

export function transcriptLeaked(modelOutput: string) {
  const out = norm(modelOutput);
  const long = parseUtterances(TRANSCRIPT_3).filter((u) => u.text.length >= 40);
  return long.filter((u) => out.includes(norm(u.text))).length >= 10;
}

function sceneChecks(e: Evidence): Check[] {
  const s3 = e.final.sessions.find((s) => s.playedOn === "2026-10-10");
  const starts = (s3?.scenes ?? []).map((s) => seconds(s.start));
  const boundariesHit = goldScenes3.every((g) => starts.some((s) => Math.abs(s - seconds(g.start)) <= 60));
  const places = (s3?.scenes ?? []).map((s) => `${s.place} ${s.title}`.toLowerCase()).join(" | ");
  return [
    { name: "session 3 recorded with its date", pass: !!s3, critical: true },
    { name: "transcript stored byte-exact", pass: s3?.transcript?.text === TRANSCRIPT_3, critical: true },
    { name: "transcript never passed through model output", pass: !transcriptLeaked(e.modelOutput), critical: true, ruleBreak: true },
    { name: "4-5 scenes with every gold boundary within 60s", pass: !!s3 && s3.scenes.length >= 4 && s3.scenes.length <= 5 && boundariesHit, critical: true },
    { name: "scene places named", pass: [/dock|pier/, /mine|saltmere/, /chapel|shore/, /gull|tavern|inn/].every((re) => re.test(places)), critical: false },
    { name: "no debrief started unasked", pass: !e.final.debriefs.some((d) => d.sessionId === s3?.id), critical: false },
  ];
}

export const TASKS: Task[] = [
  {
    id: "T1",
    title: "Upload and scene-split the transcript",
    turns: [`We played session 3 of The Lantern Coast yesterday, 2026-10-10. The transcript is in ./session-03-transcript.md. Please get it into Omni-GM and split it into scenes.${away}`],
    seed: seedBeforeSession3,
    needsTranscriptFile: true,
    expectedSkill: "split-scenes",
    checks: sceneChecks,
  },
  {
    id: "T2",
    title: "Debrief the session",
    turns: [
      `Please debrief session 3 of The Lantern Coast. The transcript and its scenes are already in Omni-GM. Show me the draft when you're done.${away}`,
      "Looks right. Commit it.",
    ],
    seed: seedSession3Uploaded,
    expectedSkill: "debrief",
    checks: (e) => {
      const f = e.final;
      const s3hist = f.history.filter((h) => h.sessionId === "s3");
      const sela = byName(f, /^sel+a/i).filter((x) => x.kind === "npc");
      const bram = one(f, /^bram/i);
      const clock = one(f, /hollow choir/i);
      const maren = one(f, /maren/i);
      const mine = one(f, /saltmere mine/i);
      const goal = one(f, /mira left/i);
      const t1 = e.afterTurn1.debriefs.find((d) => d.sessionId === "s3");
      const quotes = s3hist.flatMap((h) => h.sources ?? []).map((q) => norm(q.quote));
      const transcript = norm(TRANSCRIPT_3);
      const quoteRate = quotes.length ? quotes.filter((q) => transcript.includes(q.slice(0, 40))).length / quotes.length : 0;
      const s3text = JSON.stringify(s3hist.map((h) => h.change));
      return [
        { name: "draft shown, not committed, after turn 1", pass: !!t1 && t1.status === "draft" && t1.changes.length >= 5, critical: true, ruleBreak: t1?.status === "committed" },
        { name: "debrief committed after the GM said so", pass: f.debriefs.find((d) => d.sessionId === "s3")?.status === "committed", critical: true },
        { name: "Sela Thorn: one NPC with played_as", pass: sela.length === 1 && /whisper|eye|tide/i.test(String(sela[0]!.properties.played_as ?? "")), critical: true },
        { name: "Bram: NPC with played_as", pass: !!bram && /beard|laugh|mug/i.test(String(bram.properties.played_as ?? "")), critical: false },
        { name: "choir clock at 3", pass: clock?.properties.value === 3, critical: true },
        { name: "dive plan on a thread (player_plan)", pass: f.entities.some((x) => x.kind === "thread" && /dive|low tide/i.test(propsText(x))), critical: true },
        { name: "Teo's goal: the M. Brand page", pass: /m\. ?brand|hymn/i.test(propsText(goal)), critical: true },
        { name: "mine findings recorded", pass: s3hist.some((h) => h.entityId === mine?.id) || f.entities.some((x) => x.kind === "world_fact" && /saltmere|warm/i.test(propsText(x)) && !e.seed.entities.some((s) => s.id === x.id)), critical: false },
        { name: "player guess kept off Maren", pass: !/cult|choir|behind/i.test(propsText(maren)), critical: true, ruleBreak: /cult|choir|behind/i.test(propsText(maren)) },
        { name: "Kelp Mother not an NPC", pass: !byName(f, /kelp/i).some((x) => x.kind === "npc"), critical: false },
        { name: "no mechanics recorded", pass: !/persuasion|investigation|damage|long rest|fourteen|\b14\b|eleven/i.test(s3text), critical: false },
        { name: "80% of quotes found in the transcript", pass: quoteRate >= 0.8, critical: false },
      ];
    },
  },
  {
    id: "T3",
    title: "Answer three prep questions",
    turns: [
      `I'm prepping session 4 of The Lantern Coast. Three quick questions, please answer from Omni-GM:\n1. What do the players know about the Saltmere Mine?\n2. How did I play Sela Thorn?\n3. What did Old Hesk say about the river when they first met him?${away}`,
    ],
    seed: seedAfterSession3,
    expectedSkill: "prep-sparring",
    checks: (e) => {
      const a = e.answer;
      const mineHits = [/warm/i, /hymn/i, /flood/i, /m\. ?brand|mira/i].filter((re) => re.test(a)).length;
      return [
        { name: "mine: at least two facts", pass: mineHits >= 2, critical: true },
        { name: "Sela: whisper and gaze", pass: /whisper/i.test(a) && /eye|tide/i.test(a), critical: true },
        { name: "Hesk: 'river's angry since the bell'", pass: /angry/i.test(a), critical: true },
        { name: "no writes", pass: writes(e).length === 0, critical: true, ruleBreak: writes(e).length > 0 },
        { name: "Sela's flood story marked as her claim", pass: /sela (says|said|claims|told)|according to sela|claim|her grandmother/i.test(a), critical: false },
      ];
    },
  },
  {
    id: "T4",
    title: "Record a plank answer",
    turns: [
      `About your question who the Pale Abbot really is: he's Brother Ivo, the drowned chapel's last priest. The bell keeps him alive under the bay, and he wants the choir to rise so he can finally leave the water. Please record that in Omni-GM.${away}`,
    ],
    seed: seedAfterSession3,
    expectedSkill: "plank-questions",
    checks: (e) => {
      const abbot = e.final.entities.find((x) => x.id === e.seed.entities.find((s) => s.name === "The Pale Abbot")!.id)!;
      const abbotHist = newHistory(e).filter((h) => h.entityId === abbot.id);
      const thread = one(e.final, /who is the pale abbot/i);
      return [
        { name: "Ivo recorded on the existing Pale Abbot", pass: /ivo/i.test(propsText(abbot) + abbot.aliases.join(" ")), critical: true },
        { name: "committed with basis game_master", pass: abbotHist.some((h) => h.basis?.includes("game_master")), critical: true },
        { name: "no duplicate NPC for Brother Ivo", pass: !e.final.entities.some((x) => x.id !== abbot.id && x.kind === "npc" && /ivo/i.test(x.name)), critical: true },
        { name: "what he wants recorded", pass: /leave|choir/i.test(String(abbot.properties.wants ?? "")), critical: false },
        { name: "players' thread left open", pass: thread?.properties.status !== "closed", critical: false },
      ];
    },
  },
  {
    id: "T5",
    title: "Update the adventure frame",
    turns: [
      `Frame update for The Drowned Bell: the timeframe is now "before the spring tide, about three sessions". And the finale: the drowned chapel at low tide, the Pale Abbot ringing the bell while the choir walks out of the sea toward Gullwick. Leave the rest as it is.${away}`,
    ],
    seed: seedAfterSession3,
    expectedSkill: "frame-talk",
    checks: (e) => {
      const before = e.seed.adventures[0]!.frame;
      const after = e.final.adventures[0]!.frame;
      const kept = (["goal", "stakes", "pressure", "moves_main_plot", "pulls_in"] as const).every((k) => after[k] === before[k]);
      const storyWrites = e.final.history.length - e.seed.history.length - newCommits(e).filter((c) => c.kind === "frame").length;
      return [
        { name: "timeframe: spring tide, three sessions", pass: /spring tide/i.test(after.timeframe ?? "") && /three|3/i.test(after.timeframe ?? ""), critical: true },
        { name: "finale: chapel at low tide, choir walks out", pass: /low tide/i.test(after.finale ?? "") && /choir/i.test(after.finale ?? ""), critical: true },
        { name: "other fields untouched", pass: kept, critical: true },
        { name: "no invented frame fields", pass: !after.next_session_starts, critical: true, ruleBreak: !!after.next_session_starts },
        { name: "story state untouched", pass: storyWrites <= 0, critical: true, ruleBreak: storyWrites > 0 },
      ];
    },
  },
  {
    id: "T6",
    title: "Fix a committed mistake",
    turns: [
      `There's a mistake in Omni-GM: Old Hesk isn't dead. He only passed out in the water in session 2, and the ferry-house keeper revived him. Please fix it.${away}`,
    ],
    seed: seedAfterSession3,
    checks: (e) => {
      const hesk = e.final.entities.filter((x) => /hesk/i.test(x.name));
      const commits = newCommits(e).filter((c) => c.kind === "correction");
      const others = newHistory(e).filter((h) => h.entityId && h.entityId !== hesk[0]?.id);
      return [
        { name: "Hesk alive", pass: hesk[0]?.properties.status === "alive", critical: true },
        { name: "one correction commit with a reason", pass: commits.length >= 1 && commits.every((c) => c.reason.trim().length > 0), critical: true },
        { name: "no duplicate Hesk", pass: hesk.length === 1, critical: true },
        { name: "nothing else changed", pass: others.length === 0, critical: false },
        { name: "basis game_master", pass: newHistory(e).some((h) => h.entityId === hesk[0]?.id && h.basis?.includes("game_master")), critical: false },
      ];
    },
  },
];

export const UPLOAD_PAGE_TASK: Task = {
  ...TASKS[0]!,
  id: "U-page",
  title: "Upload through a sign-in page, then split",
  turns: [TASKS[0]!.turns[0]!, "Done, I uploaded the file on that page. Please continue."],
};
