# Debrief reviewed as a briefing proof

Every fixture, name and decision is invented. No live campaign data is used.
The MCP endpoint is the seam for the stored briefing; a headless client
against a branch preview is the seam for what the debrief and briefing
procedures make an agent do. Neither inspects tables or calls internal
functions.

## Endpoint proof

- `01-red-endpoint.log`: `tests/debrief-briefing.test.ts` on `main` plus only
  the new test. All three tests fail for the right reason: `get overview` has
  no `briefing`, `debrief_add` rejects the unknown `briefing` argument, and a
  commit is refused for a missing `lastTime` instead of a missing briefing.
- `01-green-endpoint.log`: the same three tests pass after the change. A
  committed debrief keeps its briefing, and `get overview` returns it with its
  session, its commit, and the `story` commits written since as
  `correctionsSince`. A draft without a briefing is refused at
  `debrief_commit`. A briefing over 16 KB is refused and leaves the stored
  draft briefing as it was.
- `02-red-newest-corrections.log` and `02-green-newest-corrections.log`: the
  review found that past 200 corrections the overview kept the oldest. The
  new test fails on the old query and passes once the overview keeps the 200
  newest, oldest first.
- `check.log`: the full gate (`pnpm check`) on the final tree.

## Headless client proof

`preview-deploy.log` names the source commit and a fresh staging branch
preview. `seed.log` seeds it with `scripts/debrief-briefing-e2e.ts seed`: an
adventure, one session and the invented 30-line transcript
`fixtures/debrief-briefing-session.txt`, with no scenes and no draft. The
transcript holds a named deadline (the spring tide in four days, 00:09:40), an
NPC couple (Hedda and Osric Brask, 00:05:50 and 00:06:45), a condition an NPC
set on a thread (the ferry bell before the ledger, 00:12:50), a watcher whose
role stays unclear, and a player character who never speaks.

`debrief.jsonl` is one three-turn Claude Opus 5.5 conversation with the inputs
`fixtures/debrief-briefing-start.md`, `debrief-briefing-answers.md` and
`debrief-briefing-commit.md`. The answers were written before the run, so
they answer the gaps the fixture plants, not the exact questions asked. The
model gets no procedure text from the operator; it loads `debrief`,
`map-speakers`, `split-scenes` and `briefing` from the store.

`correction.log` then writes one invented `story_commit` after the debrief
with `scripts/debrief-briefing-e2e.ts correct`. `prep.jsonl` is a new
conversation, not a resumed one, with the single input
`fixtures/debrief-briefing-prep.md`.

`readback.log` runs `scripts/verify-debrief-briefing.ts` with a fresh SDK
client. It checks, from both conversations and the store:

- turn one drafts a clock for the tide that `pressures` a thread, Hedda's tie
  to Osric and Osric's tie to Hedda in their `relationships`, and the bell
  condition in a thread's `whatIsOpen` on basis `npc_said`;
- the review shows the draft briefing stored with `debrief_add` word for
  word, with its parts in order and at most one line before it; the briefing
  itself asks nothing; after it come at most five numbered questions, one
  question mark per item, each with a timestamp, then the review options, at
  most 300 words besides the briefing, with no per-change detail;
- every answer change carries basis `game_master` and quotes the game
  master's answer; the review after the answers has the same shape around the
  revised briefing and does not list the answer changes;
- the commit happens only in turn three, and `get overview` returns the last
  stored draft briefing as the committed one;
- the store holds both ties, the condition on `npc_said`, and the tide clock
  pressuring a thread;
- the next prep loads `briefing` first, reads nothing but `get overview`
  (`skill` and `get overview` or `frame` only), shows every line of the
  stored briefing, and inserts "Since the debrief" with the correction before
  What next.

`headless-content-review.md` records a read of the conversations against the
ticket where a script cannot judge.

The prep client printed the stored briefing as plain text, without its
markdown bold and list markers, so the verifier compares lines with those
markers removed. The questions the review asked are listed in the log.
This is one model-behavior proof, not a guarantee that every model follows a
skill.

### Rejected attempts

`rejected-attempt-1-*` passed the first verifier. The cross-family review then
showed what it let through: one numbered item held two or three questions,
so five items held eight, and the answer turn listed the answer changes one
by one before the revised briefing. The procedure now asks one question per
item and shows the review again in the same shape. The stricter verifier
rejects that run (`rejected-attempt-1-recheck.log`).

`rejected-attempt-2-*` ran the stricter procedure on a new preview. Its
review shape held, but it showed a polished wording of the briefing it had
stored: 8 of 26 lines differed in turn one, so the game master would commit
text they never read. The procedure now says to write the final wording,
store it, and show it word for word, storing again before any change.

Each attempt ran on a fresh preview. The team's preview quota was full, so
attempts two and three redeployed the preview name
`feat-v2-debrief-briefing-headless-1`, which replaces its deployment with a
new, empty one. `seed.log` asserts a fresh store before seeding.

Two parsing fixes on the third run never loosened an assertion: a bold or
`#` heading that ends in a question mark, such as "How do you want to go
on?" above the options, is a heading and not a review question; and prep
may load `prep-sparring` after `briefing`, since loading a procedure reads
no story state. The recheck of the first run still rejects it.

## Reproduce

Use staging previews only. Load credentials with `~/.config/omni-gm/lib.sh`
`load_env`; never source `secrets.env` or print values. Deploy the branch
with `convex deploy --preview-create <name>` and the preview deploy key, get
an M2M access token from the staging AuthKit domain, and set
`OMNI_GM_MCP_URL` and `OMNI_GM_ACCESS_TOKEN`. Then:

```sh
pnpm exec tsx scripts/debrief-briefing-e2e.ts seed
claude -p --model claude-opus-5-5 \
  --setting-sources user --settings '{"disableAllHooks":true}' \
  --system-prompt "You are an AI client connected to the game master's Omni-GM store. Load the matching procedure with the skill tool before a workflow. Follow the served procedure and the game master's language. Use only the supplied MCP tools." \
  --strict-mcp-config --mcp-config <private-mcp-config> \
  --tools '' --permission-mode bypassPermissions \
  --verbose --output-format stream-json < fixtures/debrief-briefing-start.md
```

Continue the same conversation with `--resume <private-session-id>` and the
answers, then the commit input. Run `scripts/debrief-briefing-e2e.ts correct`,
then start a new conversation with `fixtures/debrief-briefing-prep.md`. The
private MCP config holds only the preview URL and its bearer token and is
removed after use. Publish each conversation with only user inputs, text,
tool calls, tool results and results as `debrief.jsonl` and `prep.jsonl`,
then run `pnpm exec tsx scripts/verify-debrief-briefing.ts`.
