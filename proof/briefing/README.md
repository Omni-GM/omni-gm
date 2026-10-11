# Briefing and section walk proof

Every fixture, name and decision is invented. No live campaign data is used.
The MCP endpoint is the behavior seam for the served contract; a headless
client against a branch preview is the seam for what the procedures make an
agent do. Neither inspects tables or calls internal functions.

## Endpoint proof

- `01-red-skills.log`: `tests/briefing.test.ts` on `main` plus only the new
  test. Both tests fail for the right reason: the standing rules still say
  "Never draft prep", and `story_commit` tells clients the same.
- `01-green-skills.log`: the same two tests pass after the change. `skill`
  lists `briefing` first and `prep-sparring` second, every listed skill
  loads ending in the exact standing rules that `initialize` serves, those
  rules carry the pitch guardrails, and no tool description says
  "Never draft prep".
- `check.log`: the full gate (`pnpm check`) on the final tree.

## Headless client proof

`claude-preview-deploy.log` names the source commit and a fresh staging
branch preview. `claude-seed.log` seeds it with `scripts/briefing-e2e.ts`:
the invented session `fixtures/briefing-session.txt`, three scenes, and a
committed debrief of 22 sourced changes with NPC claims, a rumor, a player
guess and plan, a shown and a hidden clock, and an empty frame. The
transcript also holds two facts the debrief left out on purpose, a deadline
without a clock and a tie between two NPCs, for the briefing's store
corrections. `claude-before.json` is the independent before snapshot.

`claude.jsonl` is the six-turn Claude Opus 5.5 conversation: each game-master
input, assistant text, tool call and tool result. The inputs are, in order,
`fixtures/briefing-start.md` (the pasted checklist with a strong-start
section and a Lazy DM secrets-and-clues section, plus the template),
`briefing-to-checklist.md`, `briefing-strong-start-pick.md`,
`briefing-to-secrets.md`, `briefing-secrets-pick.md` and `briefing-stop.md`.
The model gets no procedure text from the operator; it loads `briefing` and
`prep-sparring` from the store. `session-note.md` is the note extracted from
the last turn.

`claude-readback.log` runs `scripts/verify-briefing.ts` with a fresh SDK
client. It checks, from the conversation and the store:

- only `skill`, `get` and `find` were called: `briefing` in turn one, then
  `prep-sparring`;
- the briefing is 400 to 600 words, counted from its first part including
  sources, headings and options (577 here), with its parts in the spec's
  order and store corrections between off-screen moves and frame flags;
- every fact unit before the frame flags carries a timestamp or names a
  stored entity; the debt, key, rumor and guess lines are marked as claims;
- two or three numbered what-next options, the frame talk first, and no
  question before them;
- the strong start opens with at most five sourced facts and offers two or
  three pitches, each with "Built on"; the pick is shown back without the
  other pitches, followed by numbered next options;
- secrets and clues are ten numbered, tweet-short items;
- every section turn asks at most one question;
- the note holds the picked start and exactly the five kept items, none of
  the dropped five, and the store is unchanged.

`headless-content-review.md` records a read of the conversation against the
ticket where a script cannot judge.

### Rejected attempts

`rejected-attempt-1.jsonl` and `rejected-attempt-2.jsonl` are earlier full
runs on their own fresh previews. Both briefings ran long, 662 and 631
words, and failed the length check. The served procedure first gained an
explicit counting rule, then a word budget per part. The third run passed.
After the second attempt the verifier's parsing was fixed without
loosening an assertion: a bracket with two timestamps counts as a source, a
frame remark counts as sourced by the frame, "claimed" marks a claim, and the
note ends at the end of the template's list rather than at the agent's
closing remarks. The closing "Which one do you want?" under What next is the
option prompt, so the no-question check covers the parts before it. This is
one model-behavior proof, not a guarantee that every model follows a skill.

## Reproduce

Use staging previews only. Load credentials with `~/.config/omni-gm/lib.sh`
`load_env`; never source `secrets.env` or print values. Deploy the branch
with `convex deploy --preview-create <name>` and the preview deploy key, get
an M2M access token from the staging AuthKit domain, and set
`OMNI_GM_MCP_URL` and `OMNI_GM_ACCESS_TOKEN`. Then:

```sh
pnpm exec tsx scripts/briefing-e2e.ts
pnpm exec tsx scripts/verify-briefing.ts --before
claude -p --model claude-opus-5-5 \
  --setting-sources user --settings '{"disableAllHooks":true}' \
  --system-prompt "You are an AI client connected to the game master's Omni-GM store. Load the matching procedure with the skill tool before a workflow. Follow the served procedure and the game master's language. Use only the supplied MCP tools." \
  --strict-mcp-config --mcp-config <private-mcp-config> \
  --tools '' --permission-mode bypassPermissions \
  --verbose --output-format stream-json < fixtures/briefing-start.md
```

Continue the same conversation with `--resume <private-session-id>` and the
five remaining inputs in order. The private MCP config holds only the
preview URL and its bearer token and is removed after use. Publish the
conversation with only user inputs, text, tool calls, tool results and
results as `claude.jsonl`, then run `pnpm exec tsx scripts/verify-briefing.ts`.
