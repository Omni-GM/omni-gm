import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  checkFrameOfferTranscript,
  frameTalkQuestionField,
  type TranscriptEvent,
} from "../scripts/frame-offer-transcript";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");
const storedBriefing = read("../fixtures/frame-offer-stored-briefing.md");
const recording = (): TranscriptEvent[] =>
  read("../proof/frame-offer/claude.jsonl")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

function rewriteTurnText(
  events: TranscriptEvent[],
  turn: number,
  rewrite: (text: string) => string,
): TranscriptEvent[] {
  let current = 0;
  let rewritten = false;
  return events.map((event) => {
    if (event.type === "result") current++;
    if (
      rewritten ||
      current !== turn ||
      event.type !== "assistant" ||
      !Array.isArray(event.message?.content)
    )
      return event;
    const content = event.message.content.map((block) => {
      if (rewritten || block.type !== "text" || !block.text) return block;
      rewritten = true;
      return { ...block, text: rewrite(block.text) };
    });
    return { ...event, message: { ...event.message, content } };
  });
}

test("the recorded prep passes the transcript checks", () => {
  expect(checkFrameOfferTranscript(recording(), storedBriefing)).toHaveLength(
    3,
  );
});

test("a frame talk offered as mandatory fails the transcript checks", () => {
  const events = rewriteTurnText(recording(), 0, (text) =>
    text.replace(
      /^1\. .*frame talk.*$/m,
      "1. A frame talk is mandatory; you cannot skip it.",
    ),
  );
  expect(() => checkFrameOfferTranscript(events, storedBriefing)).toThrow();
});

test("a briefing that announces the section walk instead of the stored text fails the transcript checks", () => {
  const events = rewriteTurnText(
    recording(),
    0,
    (text) => `We already started the section walk at Strong start.\n\n${text}`,
  );
  expect(() => checkFrameOfferTranscript(events, storedBriefing)).toThrow();
});

test("a frame talk that asks about the finale fails the transcript checks", () => {
  const events = rewriteTurnText(
    recording(),
    3,
    () => "**Finale.** In the cellar, how should the adventure end?",
  );
  expect(() => checkFrameOfferTranscript(events, storedBriefing)).toThrow();
});

test("a frame talk the game master must finish before other options fails the transcript checks", () => {
  const events = rewriteTurnText(recording(), 0, (text) =>
    text.replace(
      /^1\. .*frame talk.*$/m,
      "1. Short frame talk (recommended). You are required to finish it before choosing another option.",
    ),
  );
  expect(() => checkFrameOfferTranscript(events, storedBriefing)).toThrow();
});

test("a section walk started under a plain heading before the options fails the transcript checks", () => {
  const events = rewriteTurnText(recording(), 0, (text) =>
    text.replace(
      "**What next**",
      "Strong start\nWe are now walking the first checklist section.\n\n**What next**",
    ),
  );
  expect(() => checkFrameOfferTranscript(events, storedBriefing)).toThrow();
});

test("frame-talk questions count by the core field they ask, not by incidental words", () => {
  expect(
    frameTalkQuestionField(
      "**Stakes.** Given what we know about Holloway, what is at risk, and what can the party gain?",
    ),
  ).toBe("stakes");
  expect(
    frameTalkQuestionField(
      "What is at risk if the party cannot secure their release?",
    ),
  ).toBe("stakes");
  expect(
    frameTalkQuestionField(
      "How would the players describe what this adventure is about?",
    ),
  ).toBe("goal");
  expect(() =>
    frameTalkQuestionField("**Pressure.** What keeps the party moving?"),
  ).toThrow();
});
