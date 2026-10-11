import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const proof = "proof/briefing";
const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "omni-gm-briefing-readback", version: "1" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
console.log(`PROOF TARGET ${new URL(url).origin}`);

async function call<T>(name: string, args: Record<string, unknown>) {
  const result = (await client.callTool({
    name,
    arguments: args,
  })) as CallToolResult;
  assert(!result.isError && result.structuredContent, `${name} failed`);
  return result.structuredContent as T;
}

async function snapshot() {
  const overview = await call<{ value: { sessions: { id: string }[] } }>(
    "get",
    { ref: "overview" },
  );
  const found = await call<{ hits: { ref: string }[]; truncated: boolean }>(
    "find",
    { types: ["entity"], limit: 200 },
  );
  assert(!found.truncated, "The invented fixture fits in one page");
  const entities = [];
  for (const hit of found.hits)
    entities.push(
      (await call<{ value: unknown }>("get", { ref: hit.ref })).value,
    );
  return {
    overview: overview.value,
    frame: await call("get", { ref: "frame" }),
    schema: await call("get", { ref: "schema" }),
    entities,
    sessions: await Promise.all(
      overview.value.sessions.map((s) =>
        call("get", { ref: `session:${s.id}` }),
      ),
    ),
  };
}

type Block = { type: string; name?: string; input?: { name?: string } };
type TextBlock = Block & { text?: string };
type Event = {
  type: string;
  turn?: number;
  subtype?: string;
  message?: { model?: string; content: TextBlock[] };
};

const readTools = ["skill", "get", "find"];
const normalized = (name: unknown) =>
  String(name).toLowerCase().trim().replace(/[ _]+/g, "-");
const words = (text: string) =>
  text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
const significant = (text: string) =>
  new Set(
    words(text.toLowerCase().replace(/\[[^\]]*\]/g, ""))
      .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
      .filter((w) => w.length > 3),
  );
const overlap = (part: string, whole: string) => {
  const mine = significant(part);
  const theirs = significant(whole);
  return [...mine].filter((w) => theirs.has(w)).length / (mine.size || 1);
};
const source = /\[(S\d+ )?\d{2}:\d{2}:\d{2}[\],]/;
const numbered = /^\s*\**(\d+)[.)]\**\s+(.*)$/;
const isHeading = (line: string) =>
  /^\s*(#+\s|\*\*[^*]+\*\*:?\s*$)/.test(line.trim());

function questions(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => !isHeading(line))
    .map((line) => line.replace(/["“][^"”]*["”]/g, ""))
    .flatMap((line) => line.match(/[^.!?]*\?/g) ?? []);
}

function units(text: string): string[] {
  const found: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim() || isHeading(line)) {
      found.push("");
      continue;
    }
    const starts = /^\s*([-*•]|\d+[.)])\s/.test(line) || found.at(-1) === "";
    if (starts || found.length === 0) found.push(line.trim());
    else found[found.length - 1] += ` ${line.trim()}`;
  }
  return found.filter((unit) => /\p{L}/u.test(unit));
}

function numberedItems(text: string): Map<number, string> {
  const items = new Map<number, string>();
  for (const line of text.split("\n")) {
    const match = line.match(numbered);
    if (match) items.set(Number(match[1]), match[2]);
  }
  return items;
}

function sectionFacts(text: string): string[] {
  const pitches = text.split("\n").findIndex((line) => /pitch/i.test(line));
  return units(text.split("\n").slice(0, pitches).join("\n")).filter((u) =>
    /^([-*•]|\d+[.)])\s/.test(u),
  );
}

function lastSection(text: string): string {
  const [heading, ...lines] = text.split("\n");
  const list = /^\s*([-*•]|\d+[.)])\s/;
  const end = lines.findIndex(
    (line, i) =>
      line.trim() !== "" &&
      !list.test(line) &&
      lines.slice(0, i).some((before) => list.test(before)),
  );
  return [heading, ...(end < 0 ? lines : lines.slice(0, end))].join("\n");
}

function pitchName(item: string): string {
  const bold = item.match(/\*\*([^*]+)\*\*/)?.[1] ?? item.split(/[.:—–]/)[0];
  return bold.replace(/[.:*_]/g, "").trim();
}

try {
  if (process.argv.includes("--before")) {
    await writeFile(
      `${proof}/claude-before.json`,
      `${JSON.stringify(await snapshot(), null, 2)}\n`,
    );
    console.log("PASS captured the invented store before prep");
  } else {
    const events = (await readFile(`${proof}/claude.jsonl`, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Event);
    const turns = new Map<
      number,
      { calls: string[]; skills: string[]; reply: string }
    >();
    for (const event of events) {
      if (event.type !== "assistant" || !event.turn) continue;
      assert.equal(event.message?.model, "claude-opus-5-5");
      const turn = turns.get(event.turn) ?? {
        calls: [],
        skills: [],
        reply: "",
      };
      for (const block of event.message.content) {
        if (block.type === "tool_use") {
          turn.calls.push(String(block.name));
          if (String(block.name).endsWith("__skill") && block.input?.name)
            turn.skills.push(normalized(block.input.name));
          turn.reply = "";
        }
        if (block.type === "text" && block.text)
          turn.reply += `${turn.reply ? "\n" : ""}${block.text}`;
      }
      turns.set(event.turn, turn);
    }
    assert.equal(turns.size, 6, "Six game-master turns");
    assert(
      events
        .filter((e) => e.type === "result")
        .every((e) => e.subtype === "success"),
    );
    const reply = (n: number) => {
      const text = turns.get(n)?.reply;
      assert(text, `Turn ${n} ends in a reply`);
      return text;
    };
    const allCalls = [...turns.values()].flatMap((t) => t.calls);
    assert(
      allCalls.every((name) =>
        readTools.some((tool) => name.endsWith(`__${tool}`)),
      ),
      `Prep only read the store: ${[...new Set(allCalls)].join(", ")}`,
    );
    assert(turns.get(1)?.skills.includes("briefing"), "Turn 1 loads briefing");
    assert(
      [1, 2].some((n) => turns.get(n)?.skills.includes("prep-sparring")),
      "The section walk is loaded before the first section",
    );
    console.log(
      "PASS loaded briefing, then the section walk; every tool call read the store",
    );

    const reply1 = reply(1);
    const briefing = reply1.slice(
      reply1.lastIndexOf(
        "\n",
        reply1.toLowerCase().indexOf("where the party stands"),
      ) + 1,
    );
    const count = words(briefing).length;
    assert(count >= 400 && count <= 600, `Briefing is ${count} words`);
    const lower = briefing.toLowerCase();
    const parts = [
      "where the party stands",
      "what pulls",
      "forgotten",
      "npcs in play",
      "clocks and pressure",
      "off-screen moves",
      "frame flags",
      "what next",
    ].map((part) => ({ part, at: lower.indexOf(part) }));
    for (const [i, { part, at }] of parts.entries()) {
      assert(at >= 0, `Briefing has the part "${part}"`);
      if (i > 0) assert(at > parts[i - 1].at, `"${part}" follows in order`);
    }
    const corrections = lower.indexOf("store corrections");
    if (corrections >= 0)
      assert(
        corrections > parts[5].at && corrections < parts[6].at,
        "Store corrections sit between off-screen moves and frame flags",
      );
    console.log(
      `PASS briefing of ${count} words with its parts in the spec's order${corrections >= 0 ? ", store corrections included" : ""}`,
    );

    const factual = units(briefing.slice(0, parts[6].at));
    const names = (
      JSON.parse(await readFile(`${proof}/claude-before.json`, "utf8")) as {
        entities: { name: string }[];
      }
    ).entities.map((e) => e.name.toLowerCase());
    const sourced = (unit: string) =>
      source.test(unit) ||
      names.some((name) => unit.toLowerCase().includes(name));
    const unsourced = factual.filter(
      (unit) => !sourced(unit) && !/\bframe\b/i.test(unit),
    );
    assert.deepEqual(unsourced, [], "Every fact carries a source");
    const marked = [
      {
        about: /owes|debt/i,
        mark: /according to|claim|says|said|names|calls/i,
      },
      { about: /haunt/i, mark: /rumou?r/i },
      { about: /downriver/i, mark: /guess/i },
      { about: /\bkey\b/i, mark: /according to|claim|says|said/i },
      { about: /twenty years/i, mark: /according to|claim|says|said/i },
    ];
    const npcs = units(briefing.slice(parts[3].at, parts[4].at)).filter((u) =>
      /^([-*•]|\d+[.)])\s/.test(u),
    );
    assert(npcs.length >= 3, "Three or more NPCs in play");
    for (const npc of npcs)
      assert(
        /want/i.test(npc),
        `NPC line names or flags what they want: ${npc}`,
      );
    const pre = units(briefing.slice(0, parts[5].at));
    for (const { about, mark } of marked)
      for (const unit of pre.filter((u) => about.test(u)))
        assert(mark.test(unit), `Claim is marked: ${unit}`);
    const options = numberedItems(briefing.slice(parts[7].at));
    assert(options.size >= 2 && options.size <= 3, "Two or three options");
    assert.match(options.get(1) ?? "", /frame/i, "Frame talk recommended");
    assert.deepEqual(
      questions(briefing.slice(0, parts[7].at)),
      [],
      "The briefing asks no question before its what-next options",
    );
    console.log(
      `PASS ${factual.length} fact units each sourced; claims, rumors and guesses marked; ${options.size} numbered what-next options with the frame talk first and no question before them`,
    );

    const start = reply(2);
    const builtOn = start.match(/built on/gi)?.length ?? 0;
    assert(builtOn >= 2 && builtOn <= 3, `Strong start has ${builtOn} pitches`);
    const startFacts = sectionFacts(start);
    assert(startFacts.length <= 5, "At most five facts open the section");
    assert(startFacts.every(sourced), "Every section fact is sourced");
    assert(questions(start).length <= 1, "At most one question");
    const names2 = [...numberedItems(start).values()]
      .slice(0, builtOn)
      .map(pitchName);
    console.log(
      `PASS strong start: ${startFacts.length} sourced facts, ${builtOn} pitches each "built on" (${names2.join(" | ")}), ${questions(start).length} question`,
    );

    const picked = reply(3);
    assert(
      picked.toLowerCase().includes(names2[1].toLowerCase()),
      "The pick is shown back",
    );
    for (const ignored of [names2[0], names2[2]].filter(Boolean))
      assert(
        !picked.toLowerCase().includes(ignored.toLowerCase()),
        `Ignored pitch "${ignored}" leaves no trace`,
      );
    assert(questions(picked).length <= 1);
    assert(numberedItems(picked).size >= 2, "Numbered next options");
    console.log(
      "PASS the strong-start pick is shown back alone, then numbered next options",
    );

    const secrets = reply(4);
    const items = numberedItems(secrets);
    const listed = [...Array(10).keys()].map((i) => items.get(i + 1));
    assert(listed.every(Boolean), "Ten numbered secrets and clues, 1 to 10");
    for (const item of listed as string[]) {
      const plain = item.replace(/\[[^\]]*\]/g, "").replace(/\*/g, "");
      assert(words(plain).length <= 45, `Tweet-short: ${item}`);
      assert(
        (plain.match(/[.!?](\s|$)/g)?.length ?? 1) <= 3,
        `One or two sentences: ${item}`,
      );
    }
    const secretFacts = sectionFacts(secrets);
    assert(secretFacts.length <= 5, "At most five facts open the section");
    assert(secretFacts.every(sourced), "Every section fact is sourced");
    assert(questions(secrets).length <= 1, "At most one question");
    console.log(
      `PASS secrets and clues: ${secretFacts.length} sourced facts, ten numbered, tweet-short items and at most one question`,
    );

    assert(numberedItems(reply(5)).size >= 2, "Numbered next options");
    const note = reply(6);
    const top = note.indexOf("# Session 2");
    assert(top >= 0, "The note uses the template's title");
    const rest = note.slice(top);
    const secretsAt = rest.indexOf("## Secrets and clues");
    const body = rest.slice(0, secretsAt) + lastSection(rest.slice(secretsAt));
    const startAt = body.indexOf("## Strong start");
    assert(
      startAt > 0 && secretsAt > startAt,
      "The template's sections in order",
    );
    const startEntry = body.slice(startAt, secretsAt);
    const secretsEntry = body.slice(secretsAt);
    assert(
      overlap(names2[1], startEntry) >= 0.5,
      "The picked start is in the note",
    );
    for (const ignored of [names2[0], names2[2]].filter(Boolean))
      assert(
        !startEntry.toLowerCase().includes(ignored.toLowerCase()),
        "No ignored pitch in the note",
      );
    const entries = units(secretsEntry).filter((u) =>
      /^([-*•]|\d+[.)])\s/.test(u),
    );
    assert.equal(entries.length, 5, "Five kept secrets and clues");
    const kept = [1, 2, 5, 7, 9];
    for (const [i, item] of (listed as string[]).entries()) {
      const best = Math.max(...entries.map((e) => overlap(item, e)));
      if (kept.includes(i + 1))
        assert(best >= 0.6, `Kept item ${i + 1} is in the note`);
      else assert(best < 0.6, `Dropped item ${i + 1} leaves no trace`);
    }
    await writeFile(`${proof}/session-note.md`, `${body.trim()}\n`);
    console.log(
      "PASS the note holds the picked start and exactly the five kept items",
    );

    const before = JSON.parse(
      await readFile(`${proof}/claude-before.json`, "utf8"),
    );
    assert.deepEqual(await snapshot(), before);
    console.log(
      "PASS story state, frame, schema and sessions unchanged after prep",
    );
    console.log("HEADLESS BRIEFING AND SECTION WALK PASSED");
  }
} finally {
  await client.close();
}
