I found no implementation defects in the final increment. There is one low-severity finding in the proof verifier, and one design note that needs no action. I only used Read and Grep. I read the live worktree files rather than the whole 560 KB diff, because the diff is mostly proof logs, and `fixtures/secrets-stored-briefing.md` is untracked so it isn't in that diff.

## Finding

**Low: the verifier's turn-3 checks don't match what its log line claims or what the procedure allows**
- **File/line:** `scripts/verify-secrets.ts:227-250`, which prints `proof/secrets/readback.log:5-6`.
- **Trigger:**
  - Line 235 prints "adds only the new secret". The only check behind it (lines 229-233) is that each stored briefing line still appears in turn 3. A run that regenerated or padded around the stored lines would still pass.
  - Lines 240-243 require 400 to 600 words for the whole turn-3 text. But the procedure (`convex/skills.ts:20`) says the word budget only applies to a newly written briefing, and that a stored one keeps its text "even when additions make it longer". A correct run on a longer stored briefing would fail the verifier.
- **Fix:**
  - Find the stored text inside `texts(3)`.
  - Check that whatever comes after it, up to the What next part, is only a "Since the debrief" part. That part should hold just the one `(secret)` line with `secrets[0].id`, since the run makes no corrections.
  - Drop the 400 to 600 check for the stored-briefing path, or apply it only to the added lines.
  - If you'd rather not tighten the check, change the log text to "preserves every stored line and marks the new secret".

This is a gap in what the proof asserts, not a bug in the product code. The current 595-word run is valid under both readings.

## Checked and holding
- **Since-debrief logic (`convex/secrets.ts:202-225`):**
  - It finds the latest debrief through `by_campaign_and_kind` on `"debrief"` in descending order, and reads one latest history row per page item through `by_campaign_and_secret` in descending order.
  - The `commit !== debrief._id` check keeps future #43 reveal history out of the list. The strict `_creationTime >` check is safe because writes happen in separate, ordered mutations.
  - With no debrief, every id counts as new, but that doesn't matter because the procedure then writes a fresh briefing.
  - The endpoint test (`tests/secrets.test.ts:387-452`) covers old secrets (left out), new ones (included) and edits of old ones (included) across one-item pages.
- **Bounds:** Page size is at most 200 (100 batched across `refs`) and the secrets page is capped at 100 KB read. Each extra history read is at most about 30 KB (16 KB text before, the new text, 2 KB reason, about-links). Even at the worst mix that is a few MB, inside Convex's per-query read limits. The debrief lookup runs once per page.
- **Isolation:** Every new query is scoped to the campaign. The fix path checks that the story commit belongs to this campaign and is a story commit. About-links are checked against this campaign's entities.
- **Merge with #40:** The overview briefing (`store.ts:340-342`) and `correctionsSince` use the same latest debrief. The briefing procedure keeps stored text exactly as it was, adds "Since the debrief" only when there are corrections or relevant new secrets, and doesn't repeat older secrets. Prep-sparring's rule on where factual lines get their sources, and its pitch rule, match what you described.
- **Shapes:** The record and history shapes match the spec and leave room for #43's reveal fields. Schema changes only add things.

## Design note (no action needed)
The cutoff is the debrief commit time, not the time the briefing was last saved by `debrief_add`. A secret written between the last `debrief_add` and `debrief_commit` (for example from another client) would be missing from both the stored briefing and `writtenSinceDebrief`. `correctionsSince` from #40 already uses the same cutoff and has the same gap, so it's a shared, accepted decision rather than something this increment introduced.

## Pending prose
The README and dispositions are still being updated. Nothing I read in `README.md` or the `get` tool description contradicts the implementation.
