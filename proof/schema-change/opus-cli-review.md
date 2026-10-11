**No code blockers. I'm not requesting changes to the production code.** There is one process blocker: the working tree holds a failed proof re-run that must not be committed. There are also three follow-ups.

The gate is green at HEAD 67e96ca (28 of 28 tests). The committed hosted proof passes: `sdk-e2e.log` on preview `shiny-mink-854`.

## Blocker (process)

**B1 – The uncommitted proof logs show a failed run against the wrong preview.**
- **Where:** `proof/schema-change/sdk-e2e.log` and `preview-deploy.log` (both modified, not committed).
- **Evidence:**
  - The new `preview-deploy.log` deployed to `adventurous-opossum-676`.
  - The new `sdk-e2e.log` then targeted the old URL, `PREVIEW TARGET https://shiny-mink-854.convex.site`, and failed with `StreamableHTTPError … code: 404`.
  - HEAD's versions of both files are consistent and green.
- **Reproduce:** `git diff --stat` in the worktree, then `cat proof/schema-change/sdk-e2e.log`.
- **Fix:** Either restore both files to HEAD, or re-run `scripts/schema-e2e.ts` against `https://adventurous-opossum-676.convex.site/mcp` and commit both logs together. Do not merge with a mixed or red proof bundle.

## Follow-ups (not merge-blocking)

**F1 (medium) – A retired property left in the draft blocks the whole `debrief_add` call, and the error doesn't name the change.**
- **Where:** `convex/debrief.ts:296-299`. The existing draft changes are replayed outside the per-change `try` block.
- **Evidence:**
  - After a retirement, `state.apply` throws on the old pending change. The whole call is then rejected with `Allowed properties for npc: role, wants, …`.
  - The new, valid changes are lost and the message has no change id.
  - This goes against spec user story 19 ("invalid changes rejected one by one"). The new test only calls `debrief_add` after it has dropped `c1` (`tests/mcp.test.ts`), so this path isn't covered.
- **Reproduce:**
  1. Open a draft containing `update {properties:{playedAs:"Whispers"}}`.
  2. Call `schema_change` with `retire_property npc.playedAs`.
  3. Call `debrief_add` with any valid `npcChange("New NPC")`. It throws, and the draft is unchanged.
- **Suggestion:** Name the change id in the replay error, for example `Draft change c1 is no longer valid: …; drop it`. Better still, report it in `rejected` / the draft.

**F2 (low) – The Ledger view can't drop an unrelated row while a retired-property change is in the draft.**
- **Where:** `convex/debrief.ts:354-365`.
- **Evidence:** With the F1 state plus one valid change `c2`, `debrief_drop {changeIds:["c2"]}` fails with `Drop also requires dependent changes: c1`. `c1` isn't dependent on `c2`; it is simply invalid now. The one-click drop in the view therefore fails on an unrelated row. The message does at least name the id.
- **Suggestion:** Tell "invalid under the current schema" apart from "dependent" in the message.

**F3 (low) – `get overview` gets bigger with every schema commit, and an old debrief can drop out of it.**
- **Where:** `convex/store.ts:161-184`.
- **Evidence:**
  - Each schema commit carries the full before and after schema: the starter schema alone is 1,330 bytes, so about 2.7 KB per commit, and up to 32 KB each.
  - Overview returns the latest 200 commits on every read. Ten schema changes add about 27 KB of tokens to every "what happened last time?" read.
  - `latestSession` is only looked up within those 200 commits. Enough schema commits after the last debrief therefore blank out `lastTime`.
- **Suggestion:** Return only `ops` and `reason` in overview, and serve before/after through a dedicated ref. Also look up the latest debrief commit separately, not inside the 200-commit window.

## Checked and found sound

- **Campaign isolation:** `campaignFor` scopes everything by owner, and the endpoint test proves the other owner's schema and commits are untouched.
- **Atomicity:** all validation runs on a `structuredClone` before the single patch and insert, so module constants are never mutated. The tests show an invalid batch or an oversized change leaves the schema and history unchanged. Concurrent writes are covered by Convex OCC: `debrief_commit` and `schema_change` both read the campaign document.
- **Old data:** `campaigns.schema` and `commits.schemaChange` are optional, and the commit `kind` union only gains a value. `schemaFor` falls back to the starter schema, so existing rows still validate.
- **Retirement:** stored values and history are preserved, and an `update` keeps the old value. New and pending writes are rejected at commit, because commit replays against the live schema. Retired keys can't be reused, including within one batch.
- **Validation:** key regex, prototype and reserved names, enum distinctness and non-empty values, `enumValues` only for enums, endpoint kinds, and 1 to 100 ops with a 32 KB cap. The 32 KB cap per commit puts a hard ceiling of about 16 KB on the total schema, which is several hundred properties, so it's fine for v1.
- **Runtime:** `structuredClone` works on the hosted preview, per the committed e2e. `find` still validates `kinds` against the static list, which is correct because v1 adds no new kinds.

**Verdict:** the code can merge once B1 is resolved by restoring or consistently re-running the proof logs. F1 to F3 should become follow-up issues.
