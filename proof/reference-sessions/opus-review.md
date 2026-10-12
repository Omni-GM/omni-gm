# Read-only Opus review

Command: `claude -p --model claude-opus-5-5 --tools ''` with an empty strict MCP configuration and hooks disabled. Reviewed the complete diff against `origin/main`, ticket #41 and spec #35. No execution or mutation tools were available.

# Review of #41 (reference sessions, labelled `find` hits)

**Scope and limits.** I reviewed only the diff and the ticket/spec text you supplied. I read no surrounding code, ran nothing, and posted nothing. Where a finding depends on code outside the diff, it says "verify".

## Merge blockers

### B1 · High · Acceptance criterion 3 is unproven, and part of AC1 is unproven live
**Where:** `proof/reference-sessions/` (no `claude.jsonl`, `before.json` or `contradiction.md`); `preview-base-deploy.log`.

**What's missing:**
- The headless contradiction check has no run. The verifier exists, but no evidence does.
- The preview hit `DeploymentQuotaReached`, so these are also unproven live:
  - deploying the widened schema over a populated base-schema store (the #37 requirement);
  - "never changes the stored briefing" through a real MCP readback.
- `proof/reference-sessions/README.md` describes these runs as the proof method. It never says they have not run yet.

**Failure scenario:** Under the ticket's rule "an unprovable claim … is a park, never a merge", merging now ships AC3 unchecked.

**Smallest fix:**
- Park with `wayfinder:awaiting-human` until a preview slot frees up, or retry after the quota reset.
- Until then, add a "Not yet proven" line to the proof README.

## Real findings

### F1 · Medium · The seed tells the agent where the contradiction is, which weakens AC3
**Where:** `scripts/reference-sessions-e2e.ts`, `--base`, in the `debrief_add` call.

**Problem:**
- The stored briefing (`lastTime`) says *"his fate is not in the story state"*.
- Rook's change has `why: "Keep the keeper's name, fate unrecorded"`, and that text is likely visible in entity history.
- The agent reads both before the section walk. They point straight at "Rook's fate", which defeats the README's claim that the agent finds the doubt on its own.

**Scenario:** The verifier passes because the seed told the agent where to look, not because the procedure works.

**Fix:** Make both strings neutral, for example `lastTime: "The party camps at the copper ferry [00:00:10]. Rook keeps the ferry [00:01:00]…"` and `why: "Keep the keeper"`.
- Bonus: the recent line "was called Rook" also hints at his death through the past tense. Consider "The ferry keeper is Rook."

### F2 · Medium · `latestSession` includes drafts, so it diverges from `lastTime` and from the spec's "latest committed"
**Where:** `convex/store.ts`, overview, the `latestCommitted` / `latestDraft` merge. Also `convex/skills.ts`: the briefing uses "latest session's transcript", and prep-sparring uses "overview.latestSession for the latest playable session".

**Problem:**
- The spec keys the session note to "the latest committed session". #40 will return the stored briefing for the latest session.
- In this diff, a freshly created or uploaded but not yet debriefed draft dated after the last commit becomes `latestSession`, while `lastTime` still comes from the older commit.

**Scenarios:**
- The briefing makes its "one pass over the latest session's transcript" over the undebriefed draft. That is effectively the second debrief the procedure forbids.
- #40 or #38 key the stored briefing or note to `latestSession` and pick a session that has no briefing.

**Fix:**
- Restrict `latestSession` to `status: "committed"`, so one index query replaces the two-query merge. That makes it agree with `lastTime`'s source.
- Or keep drafts, but add a test where a draft dated later than the committed session shows the intended answer, and state the semantics in the `get` description.
- Either way, flag this for the #40 rebase.

### F3 · Medium (verify) · Ordering depends on `playedOn` being ISO-formatted, and the diff adds no validation
**Where:** `convex/store.ts` `sessionArgs` / `sessionCreate`; the `by_campaign_and_playedOn` index and `localeCompare`.

**Problem:**
- Ordering is a lexicographic string sort. The README asks for `"YYYY-MM-DD"`, but `playedOn: v.string()` accepts anything.
- **Verify** whether the unseen part of `sessionCreate` validates the format.

**Scenario:** If it does not, a GM writing `"3.1.2026"` or `"2026-1-3"` breaks date ordering and `latestSession`, which defeats AC1.

**Fix:** Reject non-`/^\d{4}-\d{2}-\d{2}$/` values in `sessionCreate`, ideally also checking that the date is real, and add one refusal test.

## Lower-severity real gaps

1. **`S<n>` labels mislead (Low).**
   - Ordinals follow insertion order, so the older reference is `S2`, played before `S1`. The next played session becomes `S3`, so the GM's real "session 2" is now numbered 3.
   - The spec's `[S<n> HH:MM:SS]` citation reads as chronological. The hit title carries the date, but the procedure's citation drops it.
   - **Fix:** Cite `[S2 2026-01-03 00:04:00]` in the procedure, or document the ordinal-not-chronology rule where the GM sees it.

2. **References may be dated after the latest playable session (Low).** Test 4 locks this in. The ticket frames references as *older* sessions, and such a reference sits at `sessions[0]`. Any existing skill or client still reading `sessions[0]` as "latest" would pick it.
   - Verify that no skill (debrief, split-scenes, map-speakers) uses `sessions[0]`. Optionally refuse a reference dated after the latest non-reference.

3. **The verifier will break after #38 merges (Low).** The tool allowlist is `skill`/`get`/`find`. Once the section walk stores the pasted checklist (`checklist_set`) or note (`note_write`), the fixture's pasted checklist makes the run fail.
   - **Fix:** Forbid only story/scene/debrief writes, or re-check the verifier after rebasing onto #38.

4. **Verifier precision (Low).**
   - The "current source named" regex accepts any `your`.
   - The entity-before-transcript check accepts any `entity:` read, not Rook's.
   - The exact `@00:04:00` window match can fail a valid run that reads `@00:03:50`. That errs toward false failures, which is acceptable but brittle.

5. **`search.ts` throws on a missing session (Low, verify).** `throw new Error("Missing transcript session")` fails the whole page instead of skipping one row. This is safe only if `visible` is already filtered through the same `sessions` map. Verify that, or `continue` past the row.

6. **References attach to the current adventure (Low).** `sessionCreate` requires `currentAdventure`, so an older session from a past adventure is filed under the current one. The spec doesn't address this; worth a follow-up note.

7. **Gaps in the proof bundle's red/green (Low).**
   - `04-green-latest.log` has no red.
   - `01-red-ordering.log` fails on argument validation, not on ordering behaviour.
   - SHIP.md asks for red and green per slice.

8. **Rollback hazard (Low).** Once `reference` rows exist, reverting to a schema without the literal fails deploy validation. Mention it in the resolution comment.

9. **Nits.**
   - `by_campaign` is now a redundant prefix of two indexes, which Convex guidance discourages. Pre-existing, but the diff adds another.
   - The prep-sparring phrase "never the first inserted session" should read "last inserted": `sessions[0]` used to be the newest.

## Checked, no finding

- **Refusals:** `unlocked()` and `draftResult` guards cover `scenes_set`, `debrief_add`, `debrief_drop` and `debrief_commit`, and `get debrief:` refuses too. Each refusal is tested at the endpoint seam. Transcript upload and `get session:` still work for references.
- **Ordering and the latest window:** the 201-reference test proves `latestSession` is independent of the 200-row window. `lastTime` still comes from the latest debrief commit, as the existing contract requires.
- **Labels and pagination:** labels carry id, ordinal and `playedOn` across a `limit: 1` cursor continuation, and the ref round-trips through `get`.
- **Owner isolation:** all new queries scope by `campaign._id` from `campaignFor(caller)`. Labels come from the same campaign-scoped session map. I found no leak, though I saw no new cross-owner test for labelled hits.
- **Schema safety:** the change only widens the enum and adds indexes, so existing rows need no backfill.

**Verdict:** The code is close. F1–F3 are small fixes. B1 blocks the merge until a live preview run produces the AC3 artifact.
