# Frame offer before the section walk proof

Every fixture, name and decision is invented. No live campaign data is used.

## Test seams

- **MCP endpoint seam** (`tests/frame-offer.test.ts`): what `get overview`
  tells a client about frame currency, and what the served `briefing`,
  `frame-talk` and `get` contracts tell it to do with that. No table reads.
- **Headless agent seam** (`scripts/verify-frame-offer.ts`): a real headless
  client on a branch preview, read back by an independent SDK client.

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
- `check.log`: the full gate (`pnpm check`) on the final tree, 111 tests,
  none skipped.

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

- turn one loads only `briefing`, calls only `skill`, `get` and `find`, shows
  the stored briefing, and its What next options lead with the short frame
  talk, with the checklist option after it;
- the pick loads `frame-talk`; every frame-talk turn asks exactly one
  question, and no question opens pressure, the finale or where the next
  session starts;
- the only writes are `frame_update` calls after the answers; after the last
  one, `prep-sparring` takes the game master to the first section;
- the stored frame holds exactly goal, stakes and timeframe in the game
  master's words, every frame commit has a reason, and `currency` is
  `current`;
- story state, the stored briefing and the checklist are unchanged.

Parsing fixes during the readback never loosened an assertion: the first
draft searched the whole turn for "pressure" and failed on the agent's
explanation ("when we measure pressure in prep"); the check now reads the
question sentence. The field checks compare the game master's full phrases
and allow a capital at the start of the sentence. This is one
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
then run `pnpm exec tsx scripts/verify-frame-offer.ts`. The preview was
deleted after the readback.
