# Secret records and plank-to-briefing proof

All campaign names, transcript lines, and game-master decisions are invented.
The MCP endpoint seam drives JSON-RPC through the authenticated gateway in
`convex-test`. The headless agent seam uses a staging branch preview and
only the served MCP tools. No test reads tables or calls internal functions.

## Endpoint red and green

- `01-red-write.log`: the first write/change/history/separation test fails
  on the pre-secret tool list with `Unknown tool: secret_write`.
- `01-green-write.log`: the same assertion set passes after implementing
  separate records, history, read refs, and the overview count.
- `02-red-fix-drop.log`: fix/drop are absent from the tool contract.
- `02-green-fix-drop.log`: fixes need a sourced game-master story commit;
  fixes and drops close the record and append before/after history. The
  entity history contains only the explicit story commit.
- `03-red-validation.log`: a blank secret is wrongly accepted.
- `03-green-validation.log`: owner isolation and invalid input rejection
  pass without recording a secret or commit. This also includes the
  pagination test, which was green when added.
- `05-red-long-fix.log` and `05-green-long-fix.log`: a near-limit secret can
  be fixed with a compact game-master source and its full ref in the story
  change's why, avoiding a repeated long quote in the 16 KB story payload.
- `06-red-ref-bounds.log` and `06-green-ref-bounds.log`: secret and story
  commit refs are bounded to 200 bytes before lookup, without writing.
- `check.log`: the complete local gate, including all endpoint tests.
  `check-port-collision.log` retains a failed anonymous-local codegen attempt
  caused by another backend on the default port. This worktree then used
  its own ports 33939 and 33940; hosted previews were unaffected.

`tests/secrets.test.ts` also proves complete open-secret and history
continuations, ten-history-row pages, bounded limits, and cursors scoped to
an owner and ref. Validation includes UTF-8 byte limits, blank text/reasons,
missing or contradictory operation fields, oversized text/reason/link
arrays, nonexistent or foreign entity links, foreign secret reads/writes,
and foreign or non-game-master fix commits.

## Populated-store upgrade

`upgrade-base-deploy.log` deploys source `94d9e81`, before secrets, to its
own staging preview. `upgrade-seed.log` writes the existing invented briefing
fixture. `upgrade/story-before.json` records all entities with their full
history, sessions, schema, frame and lastTime before deployment.
`upgrade-deploy.log` deploys the additive secret schema over those rows.
`upgrade-readback.log` checks that the same public reads are unchanged, the
legacy campaign starts with zero open secrets, and its first secret write
initializes the count while preserving story state. Existing fields added
to campaigns and commits are optional; the two secret tables are new.

## Headless agent

`preview-initial-deploy.log` identifies the fresh branch preview;
`preview-deploy.log` records its final backend update from source `a9e2269`. `seed.log` uses
`scripts/briefing-e2e.ts` to commit 22 sourced changes from the invented
`fixtures/briefing-session.txt`. `before.log` and `story-before.json` capture
its complete story state and entity histories before the conversation.

`claude.jsonl` is a four-turn Claude Opus 5.5 run. Its inputs are
`fixtures/secrets-plank-start.md`, `secrets-plank-answer.md`,
`secrets-briefing.md`, and `secrets-section.md`. They request one plank
question, answer it with previously unplayed background, open the next
briefing, and open the Scenes checklist section. The model loads the
procedures from the server. No procedure text is supplied by the operator.
The independent SDK verifier `scripts/verify-secrets.ts` reads the actual
store and conversation. `readback.log` proves:

- exactly one plank question and one secret write, with no story/frame writes;
- the game master's exact answer and reason in one hidden secret, with
  before/after history and owner-scoped entity links;
- every entity and its full history, the frame, schema, sessions and
  lastTime are unchanged, and the unresolved search stays open;
- the next briefing is 400 to 600 words; the briefing and section walk both
  read open secrets and mark the exact stored answer "(secret)" with its
  full usable ref.

`briefing.md` and `section-walk.md` are the actual agent output extracted by
the verifier. This proves this model run, not every model's compliance.
Provider session ids, usage, thinking, bearer tokens and MCP connection
metadata are omitted; user inputs, assistant text, tool calls and tool
results remain.

## Retained rejected and incomplete runs

`rejected-attempt-1/` holds the first four-turn run. Its secret was correctly
stored and marked, but the briefing invented that Dace feared Holloway and
abbreviated the secret ref. It had 594 words, within the limit.
`readback-rejected.log` is the stricter verifier rejecting that unsupported
fear; the log stops at that first failure. The full-ref assertion also rejects
the abbreviated ref, and the final run passes both. The procedure now quotes stored secrets literally, requires full
refs, and keeps secrets inside the existing word budgets. Assertions were
strengthened before rerunning, not weakened to accept the result.

`baseline/` is an earlier two-turn exploration with the old plank procedure
but the new secret tool description. The model already inferred the correct
secret write. It does not prove the briefing or section walk; the incomplete
readback fails because those turns were not run. It is not a behavior-red
claim. The endpoint red logs above prove the missing behavior.

## Reproduce

Load credentials with `~/.config/omni-gm/lib.sh` `load_env`, never source
`secrets.env` or print a value. Deploy a fresh staging preview with
`CONVEX_PREVIEW_DEPLOY_KEY` and `convex deploy --preview-create <name>
--preview-run oauth:configure --yes`. Get a staging M2M bearer token and set
`OMNI_GM_MCP_URL` and `OMNI_GM_ACCESS_TOKEN`.

```sh
pnpm exec tsx scripts/briefing-e2e.ts
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

Retain only public conversation events as `claude.jsonl`, tagging each event
with its fixture turn from 1 to 4, then run
`pnpm exec tsx scripts/verify-secrets.ts`. Remove the private MCP config
after use. `OMNI_GM_PROOF_DIR` selects another artifact directory.

## Review

`opus-review.md` and `opus-fix-review.md` are read-only Claude Opus 5.5
reviews. `review-dispositions.md` records each finding and its fix or
rejection. The fixes check confirmed the code changes and rejections; its
remaining stale-log finding is resolved by the final hosted readback.

## Later reveal integration

The spec's `revealed` and `partly_revealed` statuses and optional history
`session`, `scene`, `learned`, and `sources` fields are present for #43.
That ticket must update the campaign's `openSecrets` count atomically when
a reveal moves an open record to `revealed`; partial reveals remain open.
