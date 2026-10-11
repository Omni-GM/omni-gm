I found no remaining blockers in PR #30 at `d1b6adb` for ticket #15 (spec #11). All six native findings and all five CLI findings are fixed or rejected with a reason that holds against the code.

**What I checked**
- **Diff:** read in full against the merge base `d3e5d1e`, which is also current `origin/main`.
- **Deployed code:** `git diff 868d1aa d1b6adb -- convex` is empty, so the code behind the SDK and headless runs is the final code.
- **Tests:** `vitest run` passes locally, 69 of 69.

**Acceptance criteria**
1. **`story_commit` endpoint tests: met.**
   - All changes are validated in memory before the commit row or any write (`convex/debrief.ts:611-664`).
   - A failing 4th change, or a bad timestamp, leaves the entity, overview and search unchanged (`tests/prep.test.ts:86-149`).
   - It uses the same `DraftState.apply` as the debrief. That covers the guess rule, schema, relationship endpoints, `$tempKey` and timestamps.
   - Errors name the failing change by its 1-based number.
2. **Search ranks sources and utterances and keeps each basis: met.**
   - The stronger matches are inserted after the weaker ones, so the tests catch order and score, not insertion order (`tests/prep.test.ts:290-382`).
   - Basis is checked on both pages across a continuation.
   - Ranking is within each page only. That is #28's declared `type_then_page_relevance` order, so it is inherited bounded v1 behavior, not a gap here.
3. **SDK e2e: met with one wording caveat.** The logs show a run and a repeat on a named staging preview. The ticket says "the e2e deployment". If those are the same target, the item is met; otherwise the ticket wording needs a decision.
4. **Headless run: met.**
   - It loads `prep-sparring` before reading or writing anything.
   - It asks one question per section, in the GM's order, each with a reason, and never asks what the players will choose.
   - The only write is `plank-questions` followed by one `story_commit` with basis `game_master`, the GM's exact words as source and their reason, then a readback.
   - It proposes nothing. The turn-1 offer to set frame pressure only asks whether to touch the frame; it supplies no content.
   - The final note holds only the GM's decisions plus the Landing's three mood details, all quoted from `fixtures/prep-session.txt` at 00:00:00. The Loft is marked as having no mood details. Sections have 1/4/1 flat bullets.

**What is model variability, not unmet acceptance**
- **Turn 5 correction:** the first note nested more than five bullets under Places, and the GM had to correct it. The procedure states the limit; this is model output.
- **Unanswered "why":** the plank question asked why Mira protects the seal, and the GM answered what she wants. The client stored the answer as given, said the why is still missing, and did not invent one. The GM is allowed to stop.
- **Failed Sonnet run:** it is kept and labeled as failed, and nothing claims success on it.

**Non-blocking observations**
1. **Stricter timestamp on old drafts** (`convex/debrief.ts:189-190`)
   - Trigger: debrief drafts are re-checked at add, drop and commit, which now rejects `at: ""` where before an empty timestamp was skipped.
   - Consequence: a draft already holding `at: ""` before this deploy would fail on its next add, drop or commit.
   - Fix: none needed unless a live deployment has such drafts. Otherwise strip empty `at` values before deploying.
2. **Timestamp without a session in `story_commit`**
   - Trigger: a `story_commit` source can carry an `at` timestamp, but the batch names no session.
   - Consequence: the timestamp points at no transcript. The spec allows `at?`, so this is not a defect.
   - Fix: none required. If wanted later, say in the `sources` description to omit `at` unless the quote is from a transcript.
3. **Inherited limits**
   - Source hits for relationship-only changes point at `entityIds[0]`.
   - The 2,000-entity replay capacity still applies.
   - Both come from main, are documented in the README, and this PR does not widen them.
