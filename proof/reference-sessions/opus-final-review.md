# Final read-only review of #41: reference sessions and the older-transcript contradiction check

I made no tool calls, as you asked. That includes skipping the `coder_report_task` status updates. I reviewed only the diff, the ticket, the spec, the validation excerpt and the proof artifacts you pasted. I did not read surrounding code that the diff leaves out. Where a point depends on that code, it says so.

## Verdict

- **No merge blockers in the code.**
- **All three acceptance criteria are met by the evidence.**
- Merging still needs two process steps: commit the final state, then get CI green.
- There are two medium findings and four low ones.

## Acceptance against the evidence

**AC1: ordering, unchanged latest session and briefing, refusals. Met.**
- Endpoint tests 1, 2, 4 and 5 cover each part.
- Live proof:
  - `preview-success-base-deploy.log` shows the base schema, without `by_campaign_and_playedOn`.
  - `preview-success-upgrade.log` adds only that index over the populated rows.
  - The `--reference` run asserts:
    - the date order `[recent, older]`;
    - `latestSession`, `briefing` and `commits` deep-equal to before the reference;
    - all four write refusals.
- The guards in `debrief.ts` (`unlocked` and `draftResult`) and the `get debrief:` refusal in `store.ts` cover all four write paths. The upload path stays open, which is correct.

**AC2: `find` labels utterance hits with their session. Met.**
- Test 3 covers this, including across a `limit: 1` cursor continuation.
- It is also proven live: `S2 2026-01-03 00:04:00 GM` comes back with `{id, ordinal, playedOn}`.
- The passing transcript shows the same labels.

**AC3: a headless walk catches the slip in one line with both sources. Met.**
- `claude.jsonl` shows Opus 5.5 working against the real preview.
- The served procedure text in its tool result matches the staged `skills.ts`, including `find types ["entity"]` and the `GM now: …; older: …` wording. So the passing run used the fixed procedure.
- The call order matches the verifier:
  1. load the briefing and prep-sparring skills;
  2. read the overview and the checklist;
  3. run `find Rook types:["entity"]`;
  4. read `get entity:<Rook>`, which has no record of his fate;
  5. run `find Rook types:["transcript"]`;
  6. read the `@00:04:00` window.
- The flagged line names the current claim ("your start has Rook alive") and `[S2 00:04:00]` together.
- `headless-verify.log` re-reads the store independently and finds it unchanged.
- The seed is neutral: F1 is fixed, and nothing in the stored briefing or Rook's history hints at his fate.
- Both rejected runs also caught the slip:
  - Run 01 failed only the verifier's wording regex.
  - Run 02 failed on search order.
- So the behaviour held in 3 of 3 runs, and order compliance held in 1 of 1 runs after the fix. This is honest evidence. It is only one sample for the fixed wording, which is enough for the ticket.

## Findings

### M1 · Medium · The debrief review may make its transcript pass over the wrong session
**Where:** `convex/skills.ts:19`, in the briefing procedure's "Read first" step and its transcript pass.

**Problem:**
- The briefing now tells the agent to read `latestSession` first. That field is now the *previous committed* session.
- The same procedure is loaded "always when the debrief loads this procedure for its review", and it then makes "one pass over the latest session's transcript".

**Failure case:**
- During a debrief of a new draft, `overview.latestSession` is the previous session.
- An agent that follows the new wording makes the gap pass over last session's transcript, not the session under review. Dropped deadlines and ties in the new session go unflagged.
- No headless debrief run covers this wording.

**Smallest fix:** Add one clause: "In a debrief review, the latest session is the session being debriefed; at prep it is overview.latestSession."

### M2 · Medium (low impact) · The section walk's general fact read changed scope without a re-proof
**Where:** `convex/skills.ts:40`, which changes "then find and get entity:<id>" to "then find types ["entity"] and get entity:<id>".

**Problem:**
- Rejected run 02 failed on `find {query:"Rook"}`, a mixed search, not on the unqueried listing.
- The doubt-specific sentence on line 41 already fixes that.
- The line-40 change also drops scene hits from every section's fact gathering in the #38 section walk.
- #38's headless signals (facts, pitches, ten secrets, resume) were not re-run on this wording.

**Smallest fix:** Revert line 40 to `find`. Keep the entity-only rule only in the doubt-lookup sentence on line 41.

### L1 · Low · The passing run breaks a rule this diff added
**Where:** `convex/skills.ts:41` says "Keep any contradiction question in that same line."

**Problem:**
- In `claude.jsonl`, the conflict line has no question. The question comes in a separate paragraph ("Is that older session still part…").
- The reply also ends without the hand-over line. That rule existed before this diff.
- The verifier checks neither, so the proof does not show the new sentence working.

**Smallest fix:** Either drop that sentence, since the acceptance criterion only asks for one line with both sources, or have the verifier require `?` in `lines[0]` and re-run. Dropping it is the smaller change.

### L2 · Low · The secrets readback is weaker than the log claims
**Where:** `scripts/reference-sessions-e2e.ts`, in `snapshot()`, `secrets: await get("secrets")`.

**Problem:**
- This compares only the first page. `before.json` shows that page as `truncated: true` with a stream-1 cursor.
- "Secrets unchanged" therefore does not cover later streams.
- In practice the tool allowlist (`skill`, `get`, `find`) and `openSecrets` in the overview already rule out writes. So the guarantee holds, but the log line overstates it.

**Smallest fix:** Follow `nextCursor` until it is null in `snapshot()`, or reword the PASS line.

### L3 · Low · The proof docs are stale after the rebase
**Problem:**
- `review-dispositions.md` F2 still describes `latestSession` as "behind `lastTime`".
- Item 3 still says "after #38 merges, the resume must seed…", which is already done.
- `05-red-latest-committed.log` asserts `after.lastTime`, but the current test asserts `after.briefing`. The red/green pairs are from before the rebase, and the README doesn't say so.

**Smallest fix:** Make one-line wording updates, and note that 01–05 come from the pre-rebase tree with 76 tests.

### L4 · Low · The final state is not committed
**Where:** git status.

**Problem:**
- `convex/skills.ts` (the procedure fix the passing run used), `scripts/reference-sessions-e2e.ts`, the README and most final proof files are staged but not committed on top of `8eb07fb`.
- `opus-final-review.md` is untracked.
- CI and the PR currently do not contain the code the headless proof ran against.

**Smallest fix:** Commit and push, then get CI green. The ticket's shipping rules require CI green, and the bundle has no CI evidence yet.

## Checked, no finding

- **`latestSession` and `briefing` agree:** both come from the same `latestDebrief` commit (`store.ts` overview). A newer draft (test 5) and 201 later-dated references (test 4) cannot displace them.
- **F3 is correctly rejected:** the existing `sessionCreate` validation rejects non-ISO and unreal dates, so string ordering on the index is sound.
- **Schema change is safe:** it only widens the status enum and adds one index, so existing rows need no backfill. The upgrade over a populated store is proven live.
- **Owner scoping:** labels come from the campaign-scoped `sessions` map, and every new read is scoped by `campaign._id`.
- **"Missing transcript session" throw:** I accept the disposition that it is unreachable for visible rows.
- **Fixture:** `fixtures/reference-section.md` neither names a lookup nor states the contradiction.
- **Cleanup:** `preview-cleanup.log` deletes only `reference-sessions-41-r3`, after confirming its identifier and type.
- **Invented data only:** the bundle contains only IDs and the deleted preview's hostname. That is harmless, but you could scrub it if you prefer.
