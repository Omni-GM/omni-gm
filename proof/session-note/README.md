# Session note and resume proof

Invented data only. Tests drive JSON-RPC through the MCP HTTP endpoint in
`convex-test`; the headless client uses authenticated staging previews and
independent fresh MCP SDK readback. No behavior test calls a domain function
or reads tables.

## Endpoint behavior

- [Upsert red](01-red-upsert.log) and [green](01-green-upsert.log) prove the
  ordered open entries, section updates, omitted-field preservation, unknown
  section rejection, fresh-client reads and done/skipped/open overview.
- [Finish red](02-red-finish.log) and [green](02-green-finish.log) prove that
  open sections block finishing, finished notes reject all edits, reopening
  requires a reason and restores editing with that reason retained.
- [Session and isolation green](03-green-session-isolation.log) prove that
  draft sessions do not restart prep, a new committed debrief starts a new
  note using the updated checklist, stale sessions cannot write into it,
  and another owner cannot read, overwrite or spoof the note's owner. The
  snapshot of an existing prep survives a checklist replacement.
- [Bounds red](04-red-bounds.log) and [green](04-green-bounds.log) prove an
  exact 16,000-byte entry, oversized ASCII and multibyte entries, oversized
  reopen reasons and the complete-note limit. Rejections leave reads unchanged.
- [Full gate](check.log) runs the build, Biome, anonymous-local Convex codegen,
  both TypeScript projects and the complete test suite with no skips.

[01-circular-import-error.log](01-circular-import-error.log) retains the
first implementation error. The notes module now defines its caller
validator directly, as secrets does, so registration does not read an
uninitialized module constant. [check-initial.log](check-initial.log) is the
first successful full gate before the final proof-script corrections.

## Existing-record compatibility

[Baseline deployment](baseline-deploy.log) deploys unchanged
`839fb35`, including reference sessions, into the owned preview
`session-note-42-integrated`.
[Seed](baseline-seed.log) stores the invented Tallow Mill debrief with its
transcript, scenes and 22 sourced changes. [Before](before-upgrade.log)
captures [the MCP reads](before-upgrade.json). [Upgrade](upgrade-deploy.log)
adds the note table/index and MCP tools over those populated records.
[After](after-upgrade.log) compares every existing MCP read byte-for-byte as
JSON, excluding the new overview prep field, and confirms no note exists
until a checklist is supplied.

## Stop, fresh resume and finish

[Final deployment](final-preview-deploy.log) and [seed](final-preview-seed.log)
identify the fresh owned preview `session-note-42-merged-r2`, on the combined
code and with invented data only. The populated-store compatibility proof
above ran separately on `session-note-42-integrated` using that same code.
The endpoint run is [integrated-endpoint.log](integrated-endpoint.log).
[Headless seed](headless-seed.log) stores the invented German checklist and
note template. [Before](headless-before.json) captures the existing store.

[Conversation](claude.jsonl) records five turns on Claude Opus 5.5. Turns
1–3 share a conversation, with two picks and a stop; turns 4–5 start a new
conversation without earlier messages. The runner is
`scripts/session-note-headless.sh`. It works from an empty directory, with
built-in tools and hooks disabled and only the supplied MCP server connected.
The system prompt only asks it to load the served procedure.
Provider session identifiers, thinking and usage are omitted; visible text,
inputs, tool calls/results and completion status remain.

[Stopped readback](stopped-readback.log) and [saved note](stopped-note.json)
prove two exact picks are done, two sections stay open and Requisiten is
next. [Fresh conversation](fresh-conversation.log) checks that the second
run has a different provider session. [Final readback](headless-readback.log)
checks that it opens Requisiten without rewriting previous picks, saves
materials, skips Belohnungen and finishes. [The stored finished note](finished-note.json)
and [clean markdown](session-note.md) preserve the German template's heading
order and the game master's wording.

The two unplayed clues supplied by the game master also become hidden
secrets, as spec #35 requires. Readback verifies their exact texts and that
only those secret commits were added. The oracle allows the two clues to
be stored together or separately; the verifier checks their exact text
rather than prescribing how many secret records the client must use. Story state, sessions, frame,
schema, checklist and existing history remain unchanged.

### Retained first attempt

The first run preserved both clue sentences but added list numbers despite
an explicit request for exact wording. The initial stop assertion correctly
rejected that formatting. [Verifier error](stopped-verifier-authoring-error.log)
and [first-sitting capture](first-sitting-before-verifier-fix.jsonl) remain.
A provisional verifier accepted the numbered format and continued that run
through finish; those artifacts are kept under `rejected-formatting/` and
are not the acceptance proof. The Opus review rejected the mismatch. The
served procedure now copies a complete supplied entry verbatim, including
formatting, and a fresh preview reruns the original inputs with the original
exact-wording expectation.

## Claude Code vault copy

[Fresh vault conversation](vault-claude.jsonl), [vault copy](vault-note.md)
and [verification](vault-readback.log) run with only the built-in Write tool
and the same MCP server. The game master gives an invented vault path.
The client reads the finished note and writes
a single file using the saved template and exact entries. The verifier
rejects any store write and inspects the actual file. The private temporary
path is replaced by `<invented-vault>` in the public conversation.
The runner is `scripts/session-note-vault.sh`. The first verifier unnecessarily
required a procedure load for a direct finished-note export; the client had
already read the finished note and made the copy. That authoring error is
retained in `vault-verifier-authoring-error.log`. The corrected verifier
checks the actual exported file and absence of store writes.

## Reproduce

Parse credentials through `~/.config/omni-gm/lib.sh` and `load_env`; never
source `secrets.env`. Deploy only an owned branch preview with
`CONVEX_PREVIEW_DEPLOY_KEY`; obtain a staging M2M token. Set
`OMNI_GM_MCP_URL` and `OMNI_GM_ACCESS_TOKEN` for that preview.

```sh
pnpm check
pnpm exec tsx scripts/briefing-e2e.ts
pnpm exec tsx scripts/session-note-e2e.ts --seed-headless
bash scripts/session-note-headless.sh
bash scripts/session-note-vault.sh
```

Use `--before-upgrade` on the baseline deployment and `--after-upgrade`
after the additive deploy for compatibility proof. The headless runner
performs `--stopped` readback between the two fresh runs and full readback
at the end. It requires Claude CLI, Python 3 and jq. The implementation uses
TypeScript, PNPM and Convex. A real ripgrep must be on `PATH` for codegen.

## Review

[Initial review](opus-review-initial.md), [final review](opus-review-final.md)
and [dispositions](review-dispositions.md) retain both findings, their fixes
and the reviewer's coverage limits. The final review found no blocking defects. Its low documentation finding
is fixed in the dispositions; there are no unresolved findings. CodeRabbit skipped the draft PR under its default policy.

## Integration with reference sessions

PR #50 merged before this ticket. Conflicts were resolved by retaining the
note progress plus the reference-session played-date ordering, latest
committed session, and story-state-first contradiction lookup. The note
session test now also creates an older reference and confirms that it does
not restart prep or change overview.latestSession. The full local gate is
104 tests on the combined tree. The populated preview upgrade, five-turn
stop/resume proof and actual vault export are rerun on that tree.

The earlier accepted 99-test proof is preserved under `pre-main-merge/`,
including its review, cleanup and preview records. It was superseded by the
combined-tree proof, not rejected for behavior. The originally rejected
numbered-list run remains under `rejected-formatting/`.

The first combined-tree headless run correctly saved, resumed and finished
the note, but did not store the clue material as hidden background. It is
retained under `rejected-integration/`. The final fixture explicitly says
that both clues are decided background the players have not seen, resolving
that ambiguity without changing the note entry or its exact expectation.
