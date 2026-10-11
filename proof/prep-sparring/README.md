# Prep sparring proof

Every fixture and decision is invented. No live campaign data is used.
The MCP endpoint is the behavior seam; neither tests nor proof scripts call
internal domain functions or inspect tables.

## Endpoint proof

- `01-red-story.log`, `01-green-story.log`: outside-debrief writes were
  missing, then a GM answer creates entities, aliases, links and sourced
  history atomically while preserving intent and sessions.
- `02-red-atomic.log`, `02-green-atomic.log`: malformed source timestamps
  were accepted; rejection now leaves the earlier changes, relationships,
  sources and commits unchanged. The invalid enum rollback was already
  correct and is green-only in that slice.
- `03-red-bounds.log`, `03-green-bounds.log`: an oversized/count-exceeding
  batch was accepted; the unchanged assertions now reject it before writing.
  Existing schema, basis, source and guess rules are reused and exercised
  through the same endpoint.
- `04-red-search.log`, `04-green-search.log`: the original search discarded
  source/utterance relevance position and had no structured source basis.
  These are historical runs before #28. The final search retains #28's
  declared type-then-page-relevance ranking, not that intermediate formula.
- `05-red-skills.log`, `05-green-skills.log`: the two procedures were absent,
  then clients can load them loosely by name with standing creative rules.
- `06-red-review.log`, `06-green-review.log`: rejection identifies the failed
  change, and both write paths reject a supplied empty source timestamp.
- `07-red-paginated-basis.log`, `07-green-paginated-basis.log`: the final test
  runs with main's search code, then with this PR's source basis addition.
  It asserts a known two-keyword source/utterance ahead of one-word matches
  and follows a source continuation with each claim's basis intact. Ranking
  is green-only in this integrated slice because #28 supplies it already.
- `check.log`: the full gate on the combined tree, including paginated
  recall and short drop refusals. Biome, anonymous-local Convex codegen,
  both TypeScript checks and all endpoint tests pass without skips.

Earlier red/green logs predate formatting and later coverage, so their line
numbers differ from the final file. No red result is inferred or fabricated.
Owner isolation, mixed basis, allowed guess-only threads, relationship
corrections, closed debrief preservation and unchanged lastTime are endpoint
coverage. Timestamp validation now has one implementation for both writers.

## Hosted SDK proof

`sdk-preview-deploy.log` names its source commit and branch preview.
`sdk-e2e.log` and `sdk-repeat.log` use the official MCP SDK with the staging
M2M identity. They seed a debrief and frame, reject an invalid batch and an
NPC guess, store the exact GM answer, read back its history, and search
claims and utterances with basis and timestamp context. A known two-keyword
GM answer ranks above one-keyword claims. A second run passes on the same
preview. These runs include main through #28 and #29.

## Headless client proof

`claude-preview-deploy.log`, `claude-seed.log` and `claude-before.log` name a
separate fresh staging preview and capture the committed invented fixture.
`claude-before.json` is its independent before snapshot.
`claude.jsonl` records the five-turn Claude Opus 5.5 conversation, including
each supplied GM input, assistant text and tool calls/results. `session-note.md`
is the note extracted from that conversation. `claude-readback.log` runs a
fresh SDK client to compare state and confirm the one GM answer. The public
record omits thinking blocks, MCP capability metadata, provider session IDs,
provider usage and timing; it keeps the complete behavioral conversation.

Inputs are `fixtures/prep-sparring-start.md`, then
`prep-sparring-start-answer.md`, `prep-sparring-places-answer.md` `prep-sparring-plank-answer.md` and
`prep-sparring-note-correction.md`. The model receives no copied procedure
text. It loads prep-sparring, reads the existing frame and latest debrief,
asks one question per checklist section, loads plank-questions for the gap,
and only writes the explicitly confirmed answer. The GM chose the opening,
two places, their situations and the background answer. The note adds only
three sourced narration details at Amber Landing and marks Empty Loft's
missing descriptions. It offers no unasked proposal and no player outcome. The GM corrects the
first note's nested mood bullets by talking; the final section fits the five-bullet
limit including nested bullets. The entire correction is recorded.

`failed-sonnet-attempt.jsonl` is a separate rejected attempt. The client
started another adventure and answered in German. It is not acceptance
proof. The served procedure was strengthened before the fresh Opus run to
read the existing intent first, never start an adventure in sparring and
use the explicitly requested language. The before/after comparison catches
such unwanted writes. This is one model-behavior proof, not a guarantee that
every model always follows a skill.

Reproduce on staging previews only. Load credentials with
`~/.config/omni-gm/lib.sh` `load_env`; never source `secrets.env` or print
values. Run `pnpm exec tsx scripts/prep-e2e.ts`, or `--seed-only` for a fresh
headless fixture. With that preview URL and staging token, run
`pnpm exec tsx scripts/verify-prep-sparring.ts --before`, then the client:

```sh
claude -p --model claude-opus-5-5 \
  --setting-sources user --settings '{"disableAllHooks":true}' \
  --system-prompt "You are an AI client connected to the game master's Omni-GM store. Load the matching procedure with the skill tool before a workflow. Follow the served procedure and the game master's language. Use only the supplied MCP tools." \
  --strict-mcp-config --mcp-config <private-mcp-config> \
  --tools '' --permission-mode bypassPermissions \
  --verbose --output-format stream-json < fixtures/prep-sparring-start.md
```

Continue the same conversation with `--resume <private-session-id>` and the
four remaining fixture inputs in order. The private MCP config contains
only the branch preview and its staging bearer token and is removed after
use. Publish the sanitized conversation as `claude.jsonl`, then run
`pnpm exec tsx scripts/verify-prep-sparring.ts`. The scripts use a separate
local fixture-state file for each preview hostname.

## Review

`opus-native-review.md` is the T3-owned read-only other-family review.
`opus-cli-review.md` is the literal read-only CLI review with only Read,
Glob and Grep tools. `review-dispositions.md` records every finding and its
resolution or reason for rejection. The final review includes the updated
main and completed acceptance proof. CI and deploy-main links are recorded
on the ticket after merge.
