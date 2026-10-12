I found no blocking defects. There's one low-severity documentation item. The conflict resolution keeps both tickets: this ticket's note progress and resume, and PR #50's reference sessions and lookup order.

## Findings

**1. Low: the review-dispositions text describes the old final review, not this one.** File: `proof/session-note/review-dispositions.md:17-22` (and `proof/session-note/README.md:132-135`)

- The text says `opus-review-final.md` "confirms both findings resolved" and that "its coverage limits are retained verbatim". It then lists the limits from the pre-merge review (`pre-main-merge/opus-review-final.md`).
- The file at the root will be this integration review. Its coverage limits are different (see below), and the dispositions say nothing about the integration run kept under `rejected-integration/`.
- **Failure scenario:** someone reading the merged bundle trusts the dispositions as a summary of the root review. They miss the populated-upgrade limit below and believe the older limits are the current ones.
- **Fix:** after this review lands, update the dispositions paragraph to match it. Add one line on the rejected integration run (an ambiguous fixture, fixed by making the fixture explicit, with the exact note expectation unchanged).

## Earlier findings: dispositions confirmed

- **Initial Finding 1 (stop/resume proof): fixed.**
  - `claude.jsonl` has five `result` events, all `success`, all on `claude-opus-5-5`.
  - Turns 1–3 write Auftakt, then Spuren, and stop. Turn 4 reads `note` and `overview`, makes no note writes, and opens Requisiten (lines 66–68).
  - Turn 5 makes the writes in this order: upsert Requisiten done, upsert Belohnungen skipped, finish, then `get note` (lines 71–78).
  - `session-note-headless.sh:22,39-46` clears `--resume` before turn 4 and checks that the provider session ID differs from turn 3's. `fresh-conversation.log` shows that check passed.
  - `stopped-note.json`, `finished-note.json` and `headless-readback.log` all pass.
- **Initial Finding 2 (added numbering): fixed.**
  - The served procedure (`convex/skills.ts`, the `After the game master answers` line) now copies a supplied entry verbatim.
  - The stored Spuren entry is the game master's exact single line, and `session-note.md` keeps the template's heading order with every pick verbatim.
- **Keeping only the latest reopen reason: accepted.** The spec asks for a reason to reopen, not a history of reopens, and the README documents the choice.
- **Clue secrets: correct.**
  - The verifier (`session-note-e2e.ts:231-274`) requires exactly one or two `secret_write op: write` calls in turn 3, with the game master's exact text and status `hidden`.
  - It also checks that only `secret` commits were added and that everything else in the snapshot is unchanged.
  - The run made two separate writes (lines 40 and 42), which the verifier allows.

## Integration checks (clean)

- **Same latest session everywhere.** `currentNote` (`notes.ts:122-128`) and the overview's `latestDebrief` (`store.ts:317-330`) both use the newest `debrief` commit from `by_campaign_and_kind`. So `note.session`, `overview.prep.session` and `overview.latestSession` can't disagree.
  - Sessions are listed by the date they were played, which doesn't affect which note is current.
  - Reference sessions and drafts have no debrief commit, so they can't restart prep. `session-note.test.ts:183-189` proves this, including the reference inserted after a draft.
- **Contradiction lookup keeps PR #50's order.** The procedure still checks story state first and searches older transcripts second. It still uses `overview.latestSession` rather than the newest inserted session, and the reference-session rules are intact. The only addition is the note handling.
- **Writes and isolation:**
  - Every check runs before the single patch or insert, so a rejected call writes nothing.
  - The campaign comes from the signed-in caller; a spoofed `caller` argument is ignored, as tested at lines 216–253.
  - A write naming an old session is refused with "Prep changed" (line 212).
  - The checklist is saved with the note on its first write, and a later `checklist_set` only applies to the next note (lines 175–182, 190–204).
- **Schema deployment only adds things.** `upgrade-deploy.log` adds just `notes.by_campaign_and_session`, on top of a baseline deployed at 839fb35 with data in it. `after-upgrade.log` passes.
- **Gate:** `check.log` passes 104/104 tests. The only Biome note is in the unchanged file `tests/mcp.test.ts:713`. All 6 tests in `integrated-endpoint.log` pass.

## Coverage limits

- **Upgrade data had no reference session.** `before-upgrade.json` holds only committed sessions. Because the note is keyed to debrief commits and not to sessions, I don't count this as a defect.
- **Vault export was a separate request.** It ran in its own client with only Write available. It proves a Claude Code client can copy the finished note into the vault without store writes. It does not prove the procedure writes to the vault by itself when prep finishes, because the five-turn run had no tools besides the MCP server.
- **One model run.** The acceptance proof is a single successful run; I didn't measure how often the model behaves this way.
- **Circular import.** `store.ts` and `notes.ts` still import each other. My only evidence that this loads correctly is the passing local gate and the two preview deployments.
