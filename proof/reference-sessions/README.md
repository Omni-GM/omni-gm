# Older-transcript contradiction proof

All campaign data is invented. The behavior seams are the signed-in MCP
endpoint and a headless agent using the served section-walk procedure.

## Endpoint slices

The 01–05 red/green pairs were captured before #38/#39/#40 landed, on the
76-test tree. The rebase updated the same endpoint assertions from the old
`lastTime` response to #40's full stored `briefing` record. Both rebased and
final gates exercise those unchanged behavior requirements.

- `01-red-ordering.log` fails on the original tree because `session_create`
  does not accept `reference`; `01-green-ordering.log` passes the same test.
- `02-red-refusals.log` demonstrates that a reference could still receive
  scenes before the write guard; `02-green-refusals.log` passes after it.
- `03-red-labels.log` shows unlabelled transcript hits; `03-green-labels.log`
  passes with session id, stable ordinal, played date and readable title.
- `04-green-latest.log` also proves that a reference with a later date cannot
  become latest, even when 201 references fill the overview's 200-row window.
- `05-red-latest-committed.log` reproduces a newer draft replacing the session
  behind the stored briefing; `05-green-latest-committed.log` proves that
  draft no longer displaces the committed session.
- `check.log` is the original full `pnpm check` gate; `check-final.log` is the final integrated gate.

Session ordinals remain stable identifiers in insertion order. The session
list sorts by played date, independently of ordinals. `overview.latestSession`
excludes references, including when the overview list is full of references.
After rebasing onto #40, `briefing` is the full stored briefing record from
the most recent debrief commit, and `latestSession` identifies that same
committed session. The schema
only widens the status enum and adds a played-date index; existing rows need no backfill.

## Resume after #38, #39 and #40

`check-resume.log` is the full local gate on the rebased tree: 98 tests pass.
The endpoint assertions now compare the stored briefing record from #40.
The preview seed stores the checklist and template with `checklist_set`,
and the headless input uses that stored checklist. The verifier requires a
checklist read and independently compares the checklist and secrets too.

`preview-base-deploy.log`, `preview-quota-retry.log` and
`preview-resume-base-deploy.log` preserve the earlier quota refusals. No
preview was created by those attempts. The conductor freed preview slots
before the successful run below.

## Preview and headless proof

Proven on the branch's `reference-sessions-41-r4` preview:

- `preview-success-base-deploy.log` and `preview-success-base-seed.log` show
  the current base schema deployed and populated through MCP.
- `preview-success-upgrade.log` and `preview-success-reference.log` show
  the branch deployed over those rows and every endpoint assertion passing.
- `claude.jsonl` is the sanitized Opus 5.5 conversation using the actual
  served procedures and MCP tools. `contradiction.md` keeps its source line.
- `headless-verify.log` proves the entity read preceded transcript search,
  the death window was read, and the reply names both sources in one line.
  Independent MCP readback matches `before.json`, including the checklist
  and secrets.
- `preview-cleanup.log` records deletion of only this branch's preview.

Three rejected attempts remain in `rejected-claude-01.jsonl`,
`rejected-claude-02.jsonl` and `rejected-claude-03.jsonl`, with their corresponding verifier failures. The
first did not match the named-current-source assertion. The second searched
all record types before reading the entity. That real ordering failure led
to an explicit entity-only search in the served procedure, a clear current
GM source format and a stronger verifier guard against early mixed searches.
`pre-review-run/preview-procedure-fix.log` records the initial fix;
`preview-procedure-fix.log` records the final fix before the passing run.
The post-review third rejection skipped the utterance read and split the
contradiction across bullets. The procedure now explicitly requires the
conflicting hit ref to be read and both sources kept in one line.
No acceptance assertion was removed or weakened.

`scripts/reference-sessions-e2e.ts --base` seeds a preview running the base
schema with a normal session, a committed briefing and the invented keeper
Rook. His fate is absent from story state. Deploy the changed branch over
that populated preview, then run `--reference` to upload the older transcript
as S2, played before S1. Only that transcript says Rook died at 00:04:00.
The script proves date ordering, unchanged latest session and briefing,
scene/debrief refusals, and labelled search hits through MCP.

`fixtures/reference-section.md` supplies the game master's proposed strong
start, "Rook is alive and guarding the ferry." It does not tell the agent
where to search or what the contradiction is. The agent must load the served
procedure, read the entity and its history, then search the older transcript
only because story state cannot settle the doubt.

Run the headless client against that preview with only the MCP tools:

```sh
claude -p --model claude-opus-5-5 \
  --setting-sources user --settings '{"disableAllHooks":true}' \
  --system-prompt "You are the game master's Omni-GM client. Load the matching served skill before a workflow and follow it. Use only the supplied MCP tools. Respond in English." \
  --strict-mcp-config --mcp-config <private-mcp-config> \
  --tools '' --permission-mode bypassPermissions \
  --verbose --output-format stream-json < fixtures/reference-section.md
```

Keep only user inputs, assistant text/tool calls, tool results and the result
status in `claude.jsonl`; omit credentials, signed upload URLs, provider usage
and operational metadata. The `--reference` mode captures the baseline; `--snapshot` can recapture it
before a headless rerun and follows all secrets pages. Then
`pnpm exec tsx scripts/reference-sessions-e2e.ts --verify` checks the actual conversation and independently reads the store
again. It requires the older timestamp window, one contradiction line naming
both the current game-master claim and `[S2 00:04:00]`, and unchanged story
state, sessions, commits, frame and briefing.

Load credentials with `~/.config/omni-gm/lib.sh` `load_env`, never by sourcing
`secrets.env`. Set `OMNI_GM_MCP_URL` to the branch preview and
`OMNI_GM_ACCESS_TOKEN` to a staging M2M token. Private configs and raw provider
logs stay outside the repository.


## Final review rerun

`opus-final-review.md` confirmed acceptance on r3 and identified procedure
and verifier improvements. `review-dispositions.md` records every finding.
The r3 artifacts it inspected remain in `pre-review-run/`. The root artifacts
come from a fresh r4 baseline, upgrade and headless run after those fixes.
The briefing distinguishes prep's latest committed session from the draft
under debrief review. General fact listing keeps scene hits. Independent
readback now follows all secrets pages, including empty continuations.
