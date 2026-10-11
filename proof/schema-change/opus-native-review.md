I found no blockers. There's one medium issue I'd fix before merge because the fix is cheap, plus three low follow-ups.

I read the full diff of `67e96ca` against `origin/main` with `impl18.md` and `spec11.md` as the oracle. That covers the production code, the endpoint tests, `scripts/schema-e2e.ts` and the proof logs, the README, `GLOSSARY.md` and ADR 0001. The ticket #18 body itself isn't in the local files, so I judged against the spec's schema section and the `schema_change` contract. Neither the glossary nor the ADR has schema terms that conflict. I made no edits and ran no tests.

## Findings

### 1. Medium, fix before merge: a pending draft change that a retirement made invalid breaks `debrief_add`, `debrief_drop` and `debrief_commit` with errors that don't say which change is at fault

- **Code:** `convex/debrief.ts:295-298` (`add`) replays the stored draft without a try/catch:
  ```ts
  for (const p of s.changes) { validScene(s, p); state.apply(p, `draft-${p.id}`); }
  ```
  `commit` at `convex/debrief.ts:430-433` does the same. `drop` at `:353-361` catches the failure but reports the change as a "dependent".
- **Reproduction:**
  1. Draft `c1` updates an npc's `playedAs`.
  2. `schema_change` retires `npc.playedAs`.
  3. Call `debrief_add` with any valid new change.
- **What happens:**
  - The whole call fails with `Allowed properties for npc: role, wants, …`. The AI will read that as a rejection of its new proposal.
  - This breaks the spec contract for `debrief_add`: "Rejects invalid changes one by one … and keeps the others".
  - `debrief_commit` fails with the same message and no change id.
  - `debrief_drop` of some other change fails with "Drop also requires dependent changes: c1", which is the wrong reason.
- **Why tests miss it:** the endpoint test (`tests/mcp.test.ts`, the retirement test) and the hosted proof (`scripts/schema-e2e.ts:259-263`) already know the bad id and drop `c1` straight away. They never call `debrief_add` while the stale change is still pending. The README tells the AI to "drop or replace" the change, but "replace" through `debrief_add` cannot work until the drop has happened.
- **Fix:** wrap the replay in `add` and `commit` in a helper that rethrows with the id, for example `Pending change c1 is no longer valid (<reason>); drop it with debrief_drop first`. Use the same wording in `drop`. Add one assertion: `debrief_add` before the drop rejects, and the message names `c1`.

### 2. Low, follow-up: `get overview` now carries full before/after schema snapshots on every schema commit

- **Code:** `convex/store.ts:179` spreads the whole `schemaChange` into each commit, and overview takes up to 200 commits.
- **Effect:** each schema commit adds about 2.5–3 KB (two full schema copies) to overview. The `debrief` skill (`convex/skills.ts:27`) starts every debrief with `get overview`, so every schema change permanently grows the AI's context at each debrief.
- **Suggestion:** keep `reason` and `ops` in overview and move before/after behind a ref. This is not a correctness bug.

### 3. Low, follow-up: the required `description` on new properties and relationship types is not kept in the live schema

- **Code:** `convex/schemaChanges.ts:107-108` stores only the type or enum values. `:70-74` stores only from, to and the two labels.
- **Effect:** the description survives only inside `ops` in history. `get schema`, which the skill tells the AI to read for allowed properties, never shows what `manner` means.
- **Assessment:** this is acceptable for v1 because spec story 54 is met through the reason and ops history. The field is collected but not served.

### 4. Low, follow-up: once a campaign has a stored schema, later code changes to the starter schema no longer reach it

- **Code:** `schemaFor` (`convex/model.ts:264-266`) falls back to the starter definitions only while `campaign.schema` is absent.
- **Status:** the PR's merge-risk callout already names this as a one-way door. A starter-schema change in a later ticket would need a migration.

## Checked and found correct

- **Owner scoping:** every path goes through `campaignFor(ctx, caller.subject)`. The isolation test proves another owner sees neither the schema nor the commit.
- **Atomic batches:** all ops are applied to a `structuredClone` and checked before a single patch and insert. The tests pair a valid op with each invalid one and check that schema and history are unchanged. The hosted proof does the same. Concurrent debrief writes read the campaign document, so Convex's concurrency checks order them against a schema change.
- **Retirement:** the definition moves to `retiredProperties`. Updates that don't touch the key keep the old value (`{...before.properties, ...op.properties}`). Re-adding a retired key is rejected, also within the same batch. A retire after an add in the same batch works.
- **Existing campaigns:** `schema` is an optional field and the commit `kind` union only widens, so documents already deployed still validate. Campaigns with no stored schema read the starter definitions.
- **Validation at write time:** `DraftState` now takes the campaign's schema, and `add`, `drop` and `commit` all use it. Relationship labels in `get entity` come from the campaign's schema too. `find`'s kind filter still uses the static list, which is fine because v1 adds no kinds.
- **Key safety:** `validKey` rules out prototype names, reserved entity fields, and keys that Convex rejects (anything not starting with a letter).
- **Hosted proof:** `call()` treats `isError` as a failure, so a rejection the proof expects really rejected. The checks with no expected message (around `:325`) are backed by schema and commit equality afterwards, which is enough. The recorded run passed on the preview, and the recorded gate shows 28/28 tests passing.

## Verdict

**Approve with one recommended pre-merge fix (finding 1).** I found no blockers. Correctness, owner scoping, atomic batches, retirement, compatibility with existing campaigns, Convex validators, and both the endpoint and hosted proofs all hold. Finding 1 is a real error-path gap that a ~10-line change and one assertion would close. Findings 2–4 can be follow-ups.
