# Older-transcript contradiction proof

All campaign data is invented. The behavior seams are the signed-in MCP
endpoint and a headless agent using the served section-walk procedure.

## Endpoint slices

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
- `check.log` is the full `pnpm check` gate.

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

`preview-resume-base-deploy.log` records the resumed branch-preview attempt.
Convex still refused it with `DeploymentQuotaReached`; no preview was
created. No live upgrade or headless proof is claimed.

## Preview and headless proof

Not yet proven. Convex refused preview creation with `DeploymentQuotaReached`.
No headless run, populated-preview upgrade or live readback is claimed.
The following is the prepared reproduction method.

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
and operational metadata. Then `pnpm exec tsx scripts/reference-sessions-e2e.ts
--verify` checks the actual conversation and independently reads the store
again. It requires the older timestamp window, one contradiction line naming
both the current game-master claim and `[S2 00:04:00]`, and unchanged story
state, sessions, commits, frame and briefing.

Load credentials with `~/.config/omni-gm/lib.sh` `load_env`, never by sourcing
`secrets.env`. Set `OMNI_GM_MCP_URL` to the branch preview and
`OMNI_GM_ACCESS_TOKEN` to a staging M2M token. Private configs and raw provider
logs stay outside the repository.
