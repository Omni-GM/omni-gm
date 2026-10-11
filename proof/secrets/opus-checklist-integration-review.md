I found no blocking or medium-severity integration findings. The #38 and #39 reconciliation in the final increment is correct. There are two low-severity findings below.

## What reconciles correctly
- **Commit kinds:** `convex/model.ts` has both `"secret"` and `"checklist"`. The `commits` table reuses `commit.fields.kind`, so the two can't drift. The optional `storyCommit` was added to both, and overview only includes it when present.
- **Tools and read refs:** `secret_write` and `checklist_set` are both registered in `convex/tools.ts`. In `convex/store.ts:199`, `get` sends `secrets` / `secret:` before the `checklist` branch, so they don't collide. The `get` description and the "Allowed refs" error message both list `checklist`, `secrets` and `secret:<id>`.
- **Section walk (`convex/skills.ts:38-44`):** #38's text is kept word for word. That covers reading `get checklist` with `limit: 1`, asking once when it is null, calling `checklist_set` with verbatim names, definitions and template, and confirming with a readback. The secret reads and the per-section re-read come after it. Literal quoting, "(secret)" and the full `secret:<id>` ref match the briefing and plank-questions rules. Lines 39 and 44 send unplayed background to `secret_write` and correctly limit `story_commit` to corrections of what the table saw.
- **`tests/prep.test.ts`:** the rename from "plank answer" to "table correction" matches the new split.

## Findings
1. **Low, proof overclaims (`scripts/verify-secrets.ts:284-317`).** The PASS line says "stores and reads the supplied checklist and template without another question", but nothing checks the "reads" or "no question" parts. The verifier never asserts a turn-4 `get` with `ref: "checklist"`, never counts `?` in `texts(4)`, and never checks that the stored reason is "I want the search to drive my scene prep".
   - **Trigger:** a run that calls `checklist_set` without reading it back to confirm, or that asks a follow-up question, would still pass.
   - **Fix:** add those three assertions. The reason check can read the last entry of `get checklist` history. Alternatively, weaken the PASS text to match what is checked.
   - **Related doc gap:** the bullet list in `proof/secrets/README.md:68-75` still says "no story/frame writes" and doesn't mention the turn-4 checklist store.
2. **Low, standing rule contradicts the section walk (`convex/skills.ts:5` vs `:39`).** The standing rules say pitches are "built on named story-state facts with sources". The section walk now says "Source facts and pitches with … the full secret ref for unplayed background". Every procedure gets the standing rules appended, so a model building a pitch on a secret gets conflicting instructions. A secret is deliberately not story state, so the conflict is real.
   - **Trigger:** a section pitch whose "Built on:" names only a secret.
   - **Fix:** pick one rule. Either loosen line 5 to "named story-state facts or open secrets, with sources", or make line 39 allow secret refs only for fact lines.
   - The current run's pitches didn't build on the secret, so this run doesn't show the problem.

## Proof status
I checked this from files only, not git. In the worktree:
- `proof/secrets/readback.log` holds a full PASS against `lovely-loris-97`, including the new checklist line and "HEADLESS PLANK TO SECRET TO BRIEFING PROOF PASSED".
- `section-walk.md` shows the stored checklist, the exact template, the literal secret with its full ref, and no question.

Those proof files are modified but not committed, so I can't confirm this is the final rerun you mentioned. Treat the proof as pending until it is committed. Nothing I saw points to an implementation defect.
