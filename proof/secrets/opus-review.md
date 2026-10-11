No spec violations. The change meets ticket #39 and the spec on every point you listed. There are two low-severity correctness edges and a few proof-wording fixes, all optional.

**What I checked against code and proof**
- **Separation from story state:** `secret_write` writes only to `secrets`, `secretHistory`, `commits` (kind `secret`) and the campaign's `openSecrets` count. It never writes entities or entity history, and secrets are not in search. Tests (`tests/secrets.test.ts:75-80, 148-158`) and the headless snapshot comparison prove this.
- **History shape:** each history row carries `commit`, `op`, `reason`, `before` and `after`. The fields the later reveals ticket (#43) needs are present and optional (`convex/model.ts:107-123`).
- **Fix protocol:** a fix needs a story commit in the caller's own campaign, of kind `story`, with a change that has `game_master` basis and the secret's exact text as its source quote (`convex/secrets.ts:100-123`). A story commit holds one history row per change, so `take(501)` covers the 500-change maximum.
- **Owner isolation and input bounds:** both hold for the secret, its entity links, the fix commit and page cursors.
- **Additive schema:** the new campaign and commit fields are optional and the tables are new. The frame read filters by adventure, so secret commits can't leak into frame history. The upgrade readback passes.
- **Served procedures and tools:** they match the spec.
- **Headless proof:** the verifier reads the actual store. `briefing.md` and `section-walk.md` quote the secret literally with "(secret)" and the full ref. The section-walk pitches don't leak it. The rejected run's log fails on the invented fear, as the README says.

**Optional: correctness edges (low)**
1. **`convex/secrets.ts:62-80`: closed secrets can still change state.** `change`, `fix` and `drop` work on a secret that is already `dropped` or `fixed`.
   - **Trigger:** drop a fixed secret, or fix a dropped one.
   - **Impact:** a fixed secret dropped afterwards reads as `dropped` while its fact stays in story state. The open count stays correct because it checks the earlier status. The spec doesn't define transitions, so this isn't a violation.
   - **Smallest fix:** reject `fix` and `drop` unless the status is `hidden` or `partly_revealed`, and add one test row.
2. **`convex/secrets.ts:51` and `convex/debrief.ts:632`: a near-limit secret can't be fixed.** Secret text may be up to 16,000 bytes, but a whole story change, including that quote, `why` and the change itself, must also fit in 16,000 bytes.
   - **Trigger:** a secret above roughly 15.5 KB.
   - **Impact:** the required fix commit can never be written, so the fix always fails.
   - **Smallest fix:** cap secret text at a lower bound (8 KB is plenty) and update the README and tool description.

**Optional: polish**
3. **`convex/secrets.ts:116-117`:** a fix accepts a story commit made before the secret existed, or one already used for another secret. A game master only causes this on purpose, so it's harmless. A small fix is to require a story commit newer than the secret's write commit.
4. **`convex/secrets.ts:18`:** the `secret` ref has no length limit, unlike every other string input. Add a 200-byte cap, the same as the entity links.
5. **`proof/secrets/README.md:58-61` and `scripts/verify-secrets.ts`:** the README says the readback proves "owner-scoped entity links", but the verifier never checks `about`. The run did link The missing apprentices and Dace (visible in the readback line), but nothing asserts it. Add a check that `about` is non-empty and every entry reads back with `get entity:<id>`, or soften the README.
6. **`proof/secrets/README.md:76-80`:** the README says the stricter verifier rejected both the invented fear and the abbreviated ref. `rejected-attempt-1/readback-rejected.log` stops at the first failure (the fear), so only that one is shown. Say that the full-ref check was added afterwards and that the log only shows the fear rejection.
7. **`proof/secrets/check.log:8-30`:** biome reports one info-level `useTemplate` notice at `tests/mcp.test.ts:713`, a file this diff doesn't touch. The gate still passes; mention it only if you want a clean log.

Nothing in the #38 or #40 territory was counted against this ticket.
