# Frame offer before the section walk proof

Every fixture, name and decision is invented. No live campaign data is used.

## Test seams

- **MCP endpoint seam** (`tests/frame-offer.test.ts`): what `get overview`
  tells a client about frame currency, and what the served `briefing`,
  `frame-talk` and `get` contracts tell it to do with that. No table reads.
- **Headless agent seam** (`scripts/verify-frame-offer.ts`): a real headless
  client on a branch preview, read back by an independent SDK client.
- **Verifier seam** (`tests/verify-frame-offer.test.ts`): the transcript
  checks in `scripts/frame-offer-transcript.ts` pass the recorded run and
  reject a mandatory offer (also one the game master must finish before
  other options), a briefing that announces the section walk instead of the
  stored text or under a plain heading before the options, and a frame talk
  that asks about the finale. Valid questions that mention other words
  ("about Holloway", "their release") still count for their core field.

## Endpoint proof

- `01-red-endpoint.log`: `tests/frame-offer.test.ts` against `convex/` from
  `main`. Both tests fail for the right reason: `overview.frame` has no
  `currency`, and the briefing procedure says nothing about leading a
  stored briefing's options with a frame talk.
- `01-green-endpoint.log`: the same two tests pass after the change.
  `currency` walks `missing` (no frame, then goal and stakes only),
  `current` (goal, stakes and timeframe set), `stale` (a debrief committed
  since), `current` (a frame edit after the debrief) and `missing` (a
  blank timeframe).
- `02-red-stored-what-next.log`, `02-green-stored-what-next.log`: after the
  review, the briefing names its one exception to showing a stored briefing
  exactly: the What next change, with every other stored line word for word.
- `03-red-verifier.log`, `03-green-verifier.log`: the round-2 refutations
  of the transcript checks fail before the fix and pass after.
- `check.log`: the full gate (`pnpm check`) on the final tree merged with
  `main`, 121 tests, none skipped.

## Headless client proof

`claude-preview-deploy.log` names the source commit and a fresh staging
branch preview. `claude-seed.log` seeds it with `scripts/briefing-e2e.ts
--briefing fixtures/frame-offer-stored-briefing.md`: a committed invented
debrief, an empty frame, and a stored briefing whose What next part goes
straight to the first checklist section. That is the case where prep skipped
the frame before this change. `claude-before.log` confirms the frame is
`missing` and the stored briefing offers no frame talk, stores the invented
checklist, and writes `claude-before.json`.

`claude.jsonl` is the five-turn Claude Opus 5.5 conversation. The inputs are,
in order, `fixtures/frame-offer-start.md`, `frame-offer-pick.md`,
`frame-offer-goal.md`, `frame-offer-stakes.md` and
`frame-offer-timeframe.md`. The model gets no procedure text from the
operator; it loads `briefing`, `frame-talk` and `prep-sparring` from the
store.

`claude-readback.log` runs `scripts/verify-frame-offer.ts` with a fresh SDK
client. It checks, from the conversation and the store:

- turn one loads only `briefing`, calls only `skill`, `get` and `find`, opens
  with the stored briefing body word for word, and its What next options lead
  with the recommended short frame talk, never mandatory, with a checklist
  option after it and no other option marked recommended;
- the pick loads `frame-talk`; every frame-talk turn asks exactly one
  question, the three questions cover goal, stakes and timeframe once each,
  and no question or heading opens an optional topic or asks for an outcome;
- no turn before the frame is saved loads `prep-sparring` or opens a
  section; the only writes are `frame_update` calls after the answers; after
  the last one, `prep-sparring` opens Strong start;
- the stored frame holds exactly goal, stakes and timeframe in the game
  master's words, every frame commit has a reason, and `currency` is
  `current`;
- story state, the stored briefing and the checklist are unchanged.

This run is on the final tree merged with `main`, after the review.
`pre-review/` keeps the first run, on the procedure text before the review
fixes; it also passes the current transcript checks.

Parsing fixes during the first readback never loosened an assertion: the
first draft searched the whole turn for "pressure" and failed on the agent's
explanation ("when we measure pressure in prep"); the check now reads the
question sentence and the turn's headings. The field checks compare the game
master's full phrases and allow a capital at the start of the sentence. This is one
model-behavior proof, not a guarantee that every model follows a skill.

The stale case is endpoint coverage only; the headless run proves the
missing case the ticket names.

## Reproduce

Use staging previews only. Load credentials with `~/.config/omni-gm/lib.sh`
`load_env`; never source `secrets.env` or print values. Deploy the branch
with `convex deploy --preview-create <name>` and the preview deploy key, get
an M2M access token from the staging AuthKit domain, and set
`OMNI_GM_MCP_URL` and `OMNI_GM_ACCESS_TOKEN`. Then:

```sh
pnpm exec tsx scripts/briefing-e2e.ts --briefing fixtures/frame-offer-stored-briefing.md
pnpm exec tsx scripts/verify-frame-offer.ts --before
claude -p --model claude-opus-5-5 \
  --setting-sources user --settings '{"disableAllHooks":true}' \
  --system-prompt "You are an AI client connected to the game master's Omni-GM store. Load the matching procedure with the skill tool before a workflow. Follow the served procedure and the game master's language. Use only the supplied MCP tools." \
  --strict-mcp-config --mcp-config <private-mcp-config> \
  --tools '' --permission-mode bypassPermissions \
  --verbose --output-format stream-json < fixtures/frame-offer-start.md
```

Continue the same conversation with `--resume <private-session-id>` and the
four remaining inputs in order. The private MCP config holds only the
preview URL and its bearer token and is removed after use. Publish each turn
as its game-master input, assistant text, tool calls, tool results and the
result, without thinking, usage or session identifiers, as `claude.jsonl`,
then run `pnpm exec tsx scripts/verify-frame-offer.ts`. Both previews were
deleted after their readback.
