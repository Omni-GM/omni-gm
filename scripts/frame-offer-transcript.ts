import assert from "node:assert/strict";

type Block = {
  type: string;
  name?: string;
  input?: Record<string, unknown>;
  text?: string;
};
export type TranscriptEvent = {
  type: string;
  subtype?: string;
  message?: { model?: string; content: Block[] | string };
};
type Call = { name: string; input: Record<string, unknown> };
type Turn = { calls: Call[]; text: string };

const coreQuestions = {
  goal: /\bgoal\b|\babout\?/i,
  stakes: /\brisk\b|\bstakes?\b|\bgain\b/i,
  timeframe: /\btimeframe\b|\bdeadline\b|how long|how many sessions/i,
};
const optionalHeading =
  /finale|pressure|release|main plot|next session|pulls? in/i;
const optionalQuestion =
  /\bfinale\b|\bpressure\b|moments? of release|main plot|next session/i;
const outcomeQuestion =
  /how (does|should|will|would) .*\bend\b|who wins|\bwin\b|players? (will )?(choose|decide)/i;
const mandatoryOffer =
  /mandatory|required|\bmust\b|have to|need to|can(not|'t) skip|before (choosing|picking)/i;
const sectionWalk = /^(#+\s*|\*\*)?Strong start(\*\*)?:?\s*$/m;

function turnsOf(events: TranscriptEvent[]): Turn[] {
  const turns: Turn[] = [{ calls: [], text: "" }];
  for (const event of events) {
    const turn = turns[turns.length - 1];
    if (event.type === "result") {
      assert.equal(event.subtype, "success");
      turns.push({ calls: [], text: "" });
    }
    if (event.type !== "assistant") continue;
    assert.equal(event.message?.model, "claude-opus-5-5");
    assert(Array.isArray(event.message.content));
    for (const block of event.message.content) {
      if (block.type === "tool_use" && block.name && block.input)
        turn.calls.push({ name: block.name, input: block.input });
      if (block.type === "text" && block.text) turn.text += `${block.text}\n`;
    }
  }
  return turns.filter((turn) => turn.text || turn.calls.length);
}
const tool = (call: Call) => call.name.split("__").at(-1) ?? "";
const skillName = (call: Call) =>
  String(call.input.name ?? "")
    .toLowerCase()
    .replace(/[ _]+/g, "-");
const loadedSkills = (turn: Turn) =>
  turn.calls.filter((call) => tool(call) === "skill").map(skillName);
const questionsOf = (text: string) => text.match(/[^.!?\n]*\?/g) ?? [];
const headingsOf = (text: string) =>
  [...text.matchAll(/^(?:#+\s*(.+)|\*\*([^*]+)\*\*)/gm)].map(
    (match) => match[1] ?? match[2],
  );
const isOption = (line: string) => /^\s*\d[.)]/.test(line);
const whatNextLines = (text: string) =>
  text
    .slice(text.lastIndexOf("What next"))
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);
function storedBody(storedBriefing: string): string {
  return storedBriefing
    .slice(0, storedBriefing.lastIndexOf("What next"))
    .replace(/\**\s*$/, "")
    .trim();
}

function checkOffer(briefing: Turn, storedBriefing: string): string {
  assert.deepEqual(loadedSkills(briefing), ["briefing"]);
  assert(
    briefing.calls.every((c) => ["skill", "get", "find"].includes(tool(c))),
  );
  const shown = briefing.text.trim();
  const body = storedBody(storedBriefing);
  assert(shown.startsWith(body));
  assert.match(shown.slice(body.length).trimStart(), /^\**What next\**\s*\n/);
  const lines = whatNextLines(shown);
  for (const line of lines) {
    assert.doesNotMatch(line, mandatoryOffer);
    assert.doesNotMatch(line, sectionWalk);
  }
  const [offer, ...others] = lines.filter(isOption);
  assert(others.length >= 1 && others.length <= 3, briefing.text);
  assert.match(offer, /short frame talk/i);
  assert.match(offer, /recommended/i);
  assert(others.some((o) => /checklist|first section/i.test(o)));
  assert(others.every((o) => !/recommended/i.test(o)));
  return `PASS prep opened with the stored briefing word for word, and its what-next options lead with the recommended short frame talk: ${offer}`;
}

const coreFields = Object.keys(coreQuestions);
const label = (heading: string) => heading.toLowerCase().replace(/[^a-z]/g, "");

export function frameTalkQuestionField(turnText: string): string {
  const questions = questionsOf(turnText);
  assert.equal(questions.length, 1, turnText);
  const headings = headingsOf(turnText);
  for (const heading of headings) assert.doesNotMatch(heading, optionalHeading);
  assert.doesNotMatch(questions[0], optionalQuestion);
  assert.doesNotMatch(questions[0], outcomeQuestion);
  const headed = headings.map(label).filter((h) => coreFields.includes(h));
  if (headed.length === 1) return headed[0];
  const fields = Object.entries(coreQuestions)
    .filter(([, pattern]) => pattern.test(questions[0]))
    .map(([field]) => field);
  assert.equal(fields.length, 1, questions[0]);
  return fields[0];
}

function checkFrameTalk(questionTurns: Turn[]): string {
  const asked = questionTurns.map((turn) => frameTalkQuestionField(turn.text));
  assert.deepEqual(asked.sort(), ["goal", "stakes", "timeframe"]);
  return "PASS frame-talk asked exactly one question per turn, once each for goal, stakes and timeframe, with no optional topic or outcome";
}

function checkReturnToPrep(turns: Turn[]): string {
  const last = turns[turns.length - 1];
  for (const turn of turns.slice(0, -1)) {
    assert(!loadedSkills(turn).includes("prep-sparring"));
    assert.doesNotMatch(turn.text, sectionWalk);
  }
  const writes = turns.flatMap((turn, index) =>
    turn.calls
      .filter((c) => !["skill", "get", "find"].includes(tool(c)))
      .map((c) => ({ tool: tool(c), index })),
  );
  assert(writes.length > 0);
  assert(writes.every((w) => w.tool === "frame_update" && w.index >= 2));
  const lastWrite = last.calls.map(tool).lastIndexOf("frame_update");
  assert(lastWrite >= 0);
  assert(
    last.calls
      .slice(lastWrite + 1)
      .some((c) => tool(c) === "skill" && skillName(c) === "prep-sparring"),
  );
  assert.match(last.text, sectionWalk);
  return "PASS no section walk before the frame was saved; only frame_update wrote, after the answers, then prep-sparring opened Strong start";
}

export function checkFrameOfferTranscript(
  events: TranscriptEvent[],
  storedBriefing: string,
): string[] {
  const turns = turnsOf(events);
  assert.equal(turns.length, 5);
  const [briefing, pick, ...answers] = turns;
  assert(loadedSkills(pick).includes("frame-talk"));
  return [
    checkOffer(briefing, storedBriefing),
    checkFrameTalk([pick, ...answers.slice(0, -1)]),
    checkReturnToPrep(turns),
  ];
}
