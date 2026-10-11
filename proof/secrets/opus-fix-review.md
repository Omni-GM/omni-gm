The code fixes hold and I found no new correctness bug. One proof claim is still wrong, though: the hosted readback log was never rerun with the strengthened verifier.

## Finding (medium, proof only): `readback.log` doesn't show the new about-link check

- **Files:** `proof/secrets/readback.log:1-7`, `proof/secrets/README.md:65-69`, `proof/secrets/review-dispositions.md:32-35`
- **Trigger:** `scripts/verify-secrets.ts:193-195` now prints `PASS all N about links read back as owner-scoped entities`. That line isn't in `readback.log`, which still has only the five earlier PASS lines and the final banner. Disposition #5 says "`readback.log` records all three successful reads", and the README says the readback proves "owner-scoped entity links". Neither is backed by the committed log. So finding 5 is fixed in code but not proven; the verifier change has never run against the hosted store.
- **Fix:** rerun the readback step (the default branch after `--before`/`--upgrade`) against the hosted preview and commit the new `readback.log`. If that preview is gone, rerun the headless proof. Otherwise, soften the README and disposition #5. The verifier logic itself is correct: it asserts `about` is non-empty and calls `get entity:<id>` for each link, and `store.ts:363-364` returns `id: e.id` without the prefix, which matches how `about` is stored (`secrets.ts:96`).

## Fixes that hold

- **Near-limit fix (#2):**
  - `secrets.ts:121-129` accepts either the exact-text quote or `h.why.includes(before.id)`. It still requires a `story` commit from the same campaign and a change with `game_master` basis.
  - `before.id` is always `secret:<uuid>` (`secrets.ts:135`). A full ref therefore can't accidentally match inside another secret's ref, and the abbreviated `secret:2d3c613c…` form from the rejected run won't match.
  - The ref path can't cite a story commit made before the secret existed, because the UUID didn't exist yet.
  - The new `before !== null` guard is redundant, since fix always loads the row, but harmless.
  - The 05 red log fails on the old fix error, and green passes. The test text is 570 × 28 = 15,960 bytes, which is a real near-limit case.
- **Ref bounds (#4):** `secrets.ts:47-54` checks both refs before `campaignFor` and before any lookup. In the 06 red run, the oversized refs fail with the old error messages rather than the new one. The green test confirms the overview is unchanged.
- **Rejected-run wording (#6):** the clarified sentence matches `rejected-attempt-1/readback-rejected.log`.
- **Gate:** `check.log` passes on port 33939 with 77/77 tests, up from 75 by the two new tests. The only Biome output is the `useTemplate` info in the untouched `tests/mcp.test.ts`.
- **Docs:** the README, `tools.ts` and `skills.ts` all describe both fix paths and the 200-byte ref cap the same way.

## The rejected findings don't need changes

- **#1 (terminal states):** spec #35 story 48 says "change or drop a secret any time with a reason", and the spec defines no transitions. Closed-to-closed transitions don't touch the count (`secrets.ts:153-159` checks the earlier status), and history is kept. The rejection is sound.
- **#3 (earlier or reused commits):** the spec only asks for a `story_commit` with `game_master` basis. On the ref path, an earlier commit is impossible anyway. On the quote path, reusing or citing an earlier commit takes a deliberate game-master action that doesn't change state. The rejection is sound.
- **#7 (Biome info):** informational, in an unrelated file, and the gate exits green. The rejection is sound.

## Outside the fixes

- The new ref path makes the link between the declaration and the secret looser: any `game_master` change that mentions the ref counts, whatever it changes. This is within the spec and a deliberate tradeoff, so it's not actionable.
- Refs passed to `get` (like `secret:<id>`) have no length cap, but that was already the case and isn't part of this change.

Your instructions ask me to report status to Coder through `coder_report_task`, but that tool isn't available in this read-only session, so I didn't report status.
