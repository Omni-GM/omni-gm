# Secret records and plank-to-briefing proof

All campaign names, transcript lines and game-master decisions are invented.
The MCP endpoint seam drives JSON-RPC through the signed-in gateway in
`convex-test`. The headless agent seam uses a staging branch preview and
only the served MCP tools. Tests never read tables or call internal functions.

## Endpoint red and green

- `01-red-write.log` and `01-green-write.log`: write/change with reasoned
  before/after history, separate from entities and their history. The red
  run fails with `Unknown tool: secret_write`.
- `02-red-fix-drop.log` and `02-green-fix-drop.log`: fix/drop operations,
  closing records with history; fixes require a sourced game-master story
  commit, which is the only change entering entity history.
- `03-red-validation.log` and `03-green-validation.log`: the blank secret
  accepted in red is rejected in green. Owners cannot read/write foreign
  secrets, link foreign entities or use a foreign fix commit. Invalid and
  oversized inputs keep neither a secret nor a commit.
- `04-green-pagination.log`: complete open-secret and history pages, at
  most ten history rows, bounded limits, and cursors scoped to owner/ref.
  This test was green when added.
- `05-red-long-fix.log` and `05-green-long-fix.log`: a 15,960-byte secret can
  be fixed with a compact game-master source and its full ref in the story
  change's why, avoiding a repeated long quote in the 16 KB story payload.
- `06-red-ref-bounds.log` and `06-green-ref-bounds.log`: secret and story
  commit refs are bounded to 200 bytes before lookup, without writing.
- `07-red-since-debrief.log` and `07-green-since-debrief.log`: open-secret
  pages identify only background written or changed since the latest
  committed debrief, including edits of earlier secrets across one-item
  pages. This is the integration with #40's stored briefing.
- `check.log`: the full gate passes 93 tests after integrating #38 and #40.
  `check-port-collision.log` retains a failed anonymous-local codegen
  attempt caused by another backend on the default port. This worktree
  then used ports 33939/33940; hosted previews were unaffected.

`tests/secrets.test.ts` covers UTF-8 byte bounds, blank/missing values,
contradictory operation fields, oversized text/reason/link arrays, missing
entity links, owner isolation and sourced fix validation. Original red/
green logs predate sibling merges; the final gate runs every assertion
against the combined source, without skips.

## Populated-store upgrade

`upgrade-base-deploy.log` deploys pre-secret main `37a52f4`, including the
stored-checklist and stored-briefing changes, to this worker's own staging
preview. `upgrade-seed.log` writes the invented briefing fixture.
`upgrade/story-before.json` captures all entities and full histories,
sessions, schema, frame and the stored briefing before deployment.
`upgrade-deploy.log` deploys the additive secret schema over those rows.
`upgrade-readback.log` checks the same public reads remain unchanged, the
legacy campaign starts with zero open secrets, and its first secret write
initializes the count while preserving story state and the stored briefing.
New fields on existing campaigns/commits are optional; secret tables are new.

## Headless agent

`preview-deploy.log` identifies the final staging preview, reset from this
worker's own earlier preview after #38/#40 merged. No other worker's
preview was changed. `seed.log` commits 22 sourced changes from the invented
`fixtures/briefing-session.txt` and the exact approved briefing in
`fixtures/secrets-stored-briefing.md`, using the seeder's `--briefing` option.
`before.log` and `story-before.json` capture its public story state and
full entity histories before the conversation.

`claude.jsonl` is a four-turn Claude Opus 5.5 run. Its inputs are
`fixtures/secrets-plank-start.md`, `secrets-plank-answer.md`,
`secrets-briefing.md`, and `secrets-section.md`: ask one plank question,
record the previously unplayed answer, open the next briefing, then open
the supplied Scenes checklist section. The model loads procedures from
the server; the operator supplies no procedure text.

The independent MCP SDK verifier `scripts/verify-secrets.ts` checks the
actual conversation and store. `readback.log` proves:

- one plank question and one exact hidden secret with the game master's
  reason, separate history, and all three about links read as the owner;
- no story/frame writes; every entity and full history, frame, schema,
  session and stored briefing remain unchanged;
- the next 595-word briefing preserves every stored line and adds the new
  secret; briefing and section walk quote it literally, marked "(secret)"
  with a usable full ref;
- the section turn stores the supplied checklist once, reads it back after
  writing, preserves the exact sections/template/reason, and asks no
  further question.

`briefing.md` and `section-walk.md` are the actual extracted output. This
proves this model run, not every model's compliance. Provider session ids,
usage, thinking, credentials and connection metadata are omitted; user
inputs, assistant text and MCP tool calls/results remain intact.
`preview-initial-deploy.log` records a superseded earlier preview. The
commit history keeps the earlier passing pre-integration runs; the current
artifacts prove the final combined procedures.

## Retained rejected and incomplete runs

`rejected-attempt-1/` holds the first four-turn run. It stored and marked the
secret correctly, but invented that Dace feared Holloway and abbreviated
its ref. Its briefing was 594 words, within the limit. The stricter
`readback-rejected.log` stops at the unsupported-fear assertion. The added
full-ref assertion would also reject the abbreviation. The final run
passes both. Procedures now quote secrets literally and require usable
refs; no assertion was weakened.

`baseline/` is an earlier two-turn exploration with the old plank procedure
and the new secret tool description. The model inferred the correct secret
write. The incomplete readback fails because the briefing/section turns
were not run; it is not a behavior-red claim. The endpoint logs prove red.

## Reproduce

Load credentials with `~/.config/omni-gm/lib.sh` `load_env`, never source
`secrets.env` or print a value. Deploy a staging preview with
`CONVEX_PREVIEW_DEPLOY_KEY` and `convex deploy --preview-create <name>
--preview-run oauth:configure --yes`. Reset only an owned invented preview.
Get a staging M2M bearer token and set `OMNI_GM_MCP_URL` and
`OMNI_GM_ACCESS_TOKEN`.

```sh
pnpm exec tsx scripts/briefing-e2e.ts --briefing fixtures/secrets-stored-briefing.md
pnpm exec tsx scripts/verify-secrets.ts --before
```

Run the four fixtures, resuming the same private Claude session:

```sh
claude -p --model claude-opus-5-5 \
  --setting-sources user --settings '{"disableAllHooks":true}' \
  --system-prompt "You are an AI client connected to the game master's Omni-GM store. Load the matching procedure with the skill tool before a workflow. Follow the served procedure and the game master's language. Use only the supplied MCP tools." \
  --strict-mcp-config --mcp-config <private-mcp-config> \
  --tools '' --permission-mode bypassPermissions \
  --verbose --output-format stream-json < fixtures/secrets-plank-start.md
```

Retain public events as `claude.jsonl`, tagging each with its fixture turn
1 to 4, then run `pnpm exec tsx scripts/verify-secrets.ts`. Remove the
private MCP config after use. `OMNI_GM_PROOF_DIR` selects another artifact
directory. For the upgrade, capture `--before` under pre-secret main,
deploy this change, then run `--upgrade` in that same proof directory.

## Review and later reveals

The read-only Opus reviews and each disposition are linked in
`review-dispositions.md`. CodeRabbit skipped draft review.

The spec's `revealed`/`partly_revealed` statuses and optional history
`session`, `scene`, `learned`, and `sources` fields are ready for #43.
That ticket must update `campaign.openSecrets` atomically when a reveal
closes an open record. Partial reveals stay open. `writtenSinceDebrief`
excludes history in the latest debrief's own commit, so those reveals will
not be repeated as post-debrief writes.
