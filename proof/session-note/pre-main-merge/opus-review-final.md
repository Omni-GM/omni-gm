I found nothing left to fix: both earlier findings are resolved, and the whole diff has no remaining actionable problems.

## Previous findings

**1. Missing stop/resume proof: resolved.**
- `headless-run.log` shows all five turns, and all five results must be `success`.
- `stopped-readback.log` and `headless-readback.log` pass against `formal-giraffe-614`, which is the same preview as `final-preview-seed.log` and `final-preview-refresh.log`.
- `scripts/session-note-headless.sh:876` clears `--resume` at turn 4, so that run starts a new conversation. Line 899 checks that its session ID differs from turn 3's.
- The verifier checks:
  - turns 1 and 4 each load `prep-sparring` and read `note` and `overview`;
  - turn 4 writes nothing;
  - turn 5 writes exactly Requisiten done, Belohnungen skipped, then `finish`;
  - the stored entries are exact;
  - the template headings appear in order and the exact picks appear in the markdown;
  - only two secret commits were added and nothing else in the store changed.

**2. Numbered list instead of exact wording: resolved.**
- Both prep conversations in `claude.jsonl` received the final procedure text: the "List formatting applies to picked pitch fragments" sentence and the reopen-and-finish-again sentence each appear twice.
- `stopped-note.json` stores `Spuren` exactly as the fixture gives it, and the original exact assertion passes.
- The numbered-list run is kept under `rejected-formatting/` and the README says it is not the acceptance proof.

**Other dispositions, confirmed:**
- The Biome warning in the new script is gone. The only remaining Biome note is in `tests/mcp.test.ts:713`, which this diff doesn't touch. The gate passes 99 of 99 tests.
- Keeping only the latest reopen reason is documented in `README.md` and the `note_write` description. The ticket asks for a reason to reopen, not a reopen history, so I accept it.
- The vault export uses only `get` and `skill` plus one `Write`; the verifier allows no store write. It reads the actual saved file, which matches `session-note.md`.

## Final diff
The server files (`notes.ts`, `store.ts`, `tools.ts`, `schema.ts`, `model.ts`) haven't changed since my first review, and those checks still hold:
- unknown sections are rejected and other sections stay untouched;
- every check runs before the single write;
- writes to an old session are refused;
- the owner comes from the signed-in caller, so another owner can't read or write the note;
- the checklist is saved with the note on its first write;
- the finished note is read-only until reopened with a reason;
- the schema change only adds a table and index.

## What the proof doesn't cover
- **Vault write during prep:** the vault run is a separate export request. It called `skill` with empty input, which only lists the procedures, so the procedure's "write into the vault, or ask once for the path" step never ran live. The ticket's acceptance criteria don't require it, and the proof README calls it a direct export, so I'm not raising it as a finding.
- **Vault log target:** `vault-readback.log` doesn't print the deployment it ran against, and it compares the file with the local `finished-note.json`. The session ID in its `get note` result matches the final preview's.
- **Order of the final redeploy:** the logs don't show whether `final-preview-refresh.log` ran before or after the conversation. It doesn't change the outcome, because the procedure text in the conversation matches the final `skills.ts`.
- **Circular import:** `store.ts` and `notes.ts` still import each other. It works in vitest and on both previews; I can't check load order in the Convex runtime beyond that.
- **One run only:** the headless proof is a single successful run, so it doesn't show how often the agent gets this right.
