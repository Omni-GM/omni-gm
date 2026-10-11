# Review: Omni-GM #21, long transcripts and large history (`feat/long-transcripts`)

The code mostly does what the ticket asks. Transcript, scene and history pagination are correct, and the upload lifecycle holds up under concurrent and partial failures. Three things should be fixed before the autonomous merge, and the branch needs a rebase onto current `main` before it can merge at all. One question I couldn't settle is under item 4.

I diffed against the branch base `3a41cb1`. A plain `git diff origin/main` shows #22 and #23 as large deletions, because `origin/main` has moved on since the branch was cut.

## 1. Findings

**F1: high, blocks acceptance (merge readiness).** The branch is two merged PRs behind `origin/main`: #22 (schema change) and #23 (upload page). Both rewrote files this branch rewrites:
- `convex/uploads.ts`: `main` split the upload path into `issueToken`/`store` and added `pageSessionApi`.
- `convex/store.ts`: `schemaFor(campaign)` replaces the static `kinds`/`relationshipTypes`.
- `convex/schema.ts`, `convex/http.ts`, and `tests/mcp.test.ts`, which `main` split into `tests/mcp-client.ts`.
- `convex/search.ts` still checks `kinds` against the static `entityKinds`. After the rebase it has to use the per-campaign schema.

Consequences:
- The conflicts are not trivial. `main`'s browser upload page also posts through the upload path that this branch rebuilt as `begin`/`append`/`finish`/`abort`.
- Every artifact in `proof/long-transcripts/` was produced on pre-#22/#23 code. After the rebase the gate, the preview deploy and the SDK e2e must all be re-run.
- The upload page's own browser proof (`scripts/upload-page-e2e.ts`) has to be re-run against the new batching.

**F2: high, I recommend fixing before merge.** Sparse searches need hundreds of round trips (`convex/search.ts:75`, `:234`, `:243`).
- Each `find` call scans only `numItems = maximum - hits.length` rows and stops at the first stream that isn't finished. So a call reads at most `limit` rows, not one budget's worth.
- Example: with the default `limit: 10`, a keyword that appears only near the end of one 4,801-utterance session takes about 480 calls to reach. A campaign of 20 such sessions takes about 9,600 calls, or about 480 at `limit: 200`.
- Entities are scanned first, in creation order. For the debrief's "find by name and aliases before creating an entity" step (`convex/skills.ts`), a campaign with 300 entities takes up to 30 calls at the default limit before the right one appears.
- The old native search answered all of these in one call.
- Consequence: agents stop after a few empty pages. That gives duplicate entities and missed context, and the token cost is high. The tool text and README do disclose "several empty pages", but "several" understates it by orders of magnitude.
- Fix options:
  - Inside one call, keep calling `searchPage` on the same stream until hits are full or a row/byte budget is spent (for example about 4k rows). Remove the `break` at `:243`.
  - Or serve the first page from the native search index for relevance, and fall back to the scan only for exhaustive continuation.

**F3: medium, I recommend fixing before merge.** The upload tool contract is stale (`convex/tools.ts:79`). The `transcript_upload_url` description still says "at most 2 MB and 2000 utterances". The parser now allows 8 MB and 20,000, and the skill text and README were updated. A four-hour session (about 4,800 utterances) looks out of contract to the agent, which may refuse it or split the file. The e2e calls the tool directly, so it can't catch this.

**F4: medium.** The retry advice after a failed upload is now wrong (`convex/uploads.ts:194`, `:304`).
- When an append or finish fails after `begin`, `abort` deletes the upload ticket. The response still says "Upload failed; retry the same URL".
- Retrying the same URL returns 403 "Expired or used URL".
- Before this change, a failed `finish` left the ticket in place, so the advice was true.
- Fix: either say "request a new upload URL", or keep the ticket and reset `storage`/`count` instead of deleting it.

**F5: low.** Nothing tests backward compatibility with existing rows.
- Rows written before this change have no `transcriptGeneration` and no `ordinal`, and their sessions have no `transcriptGeneration`.
- By reading the code, they work:
  - `.eq("transcriptGeneration", undefined)` matches missing fields.
  - The visibility check in `find` compares `undefined === undefined`.
  - Cleanup maps `null` to `undefined`.
  - Repeated timestamps fall back to `_creationTime` order, which was insertion order.
- But the hosted preview was created fresh (every index shows `[+]`), and no in-process test inserts an old-shape row. The existing dev deployment does have old rows.
- One test that inserts old-shape utterances, then reads, searches and replaces them, would close this.

**F6: low.** The proof artifacts are slightly older than the final code.
- `sdk-e2e.log` is from 12:57 and `check.log` from 12:58.
- `tools.ts` was edited at 12:59:28, and `skills.ts`, `README.md` and the e2e script at 12:58:41, all after the logs.
- `red-endpoints.log` appeared at 13:01, while this review was running, so the worktree is still changing.
- The later edits look like text only. Still, the "latest" log does not cover the final tree, and F1 forces a re-run anyway.

**F7: low.** Some `get` results still truncate silently, outside the ticket's named paths:
- `get entity:` relationships use `.take(2000)` (`convex/store.ts:256`, `:262`).
- `get overview` uses `.take(200)` for sessions, adventures and commits.

The README discloses the overview cap. The relationship cap is neither disclosed nor signalled.

**F8: nit.**
- The `utterances.by_session_and_seconds` index is now unused, which costs a little on every write.
- `uploads.ts:156` changed a template literal into string concatenation, which Biome reports as an info.
- The cursor is plain JSON that exposes the campaign `_id` and the transcript storage id. Neither is a capability, so this is not a security problem. Reads are still bounded by `eq(campaign)` index ranges, and a client-forged `seen` can only distort the client's own `total`.

**Security and tenancy: no findings.**
- `readOne` and `searchPage` are internal.
- Every stream is limited to the caller's campaign by its index.
- Each cursor's scope binds campaign, ref and transcript generation, so a replacement invalidates old cursors (this is tested).
- The single-use upload holds under concurrency: a second `begin` fails on `storage !== undefined`, and `valid` rejects a ticket that is already claimed.
- An upload interrupted mid-way is cleaned up through `expire`, which now schedules `cleanup`.
- Reads and search never see a generation that is still in progress or already replaced.

## 2. Spec deviations

1. **`find` no longer ranks across all results** (#11: "ranked keyword search", "Convex search indexes … with keyword relevance"). Results now come grouped by type, ranked only within each page (`order: "type_then_page_relevance"`). The Convex text-search result ceiling is real (I didn't verify the exact 1,024 figure), so you can't go through every match with native search alone. That partly justifies the change. But a hybrid would keep both: native search for the first page, the scan only for exhaustive continuation. As built, the cost lands on sparse searches (F2).
2. **Matching changed from prefix to whole keywords.** `lant` no longer finds `lantern`. This follows from the scan design and is disclosed in the README. Acceptable, but it is a behaviour change for existing agents.
3. **`total` changed meaning.** It now counts hits seen so far, which is a lower bound until `totalIsExact` is true. Before, it was the number of candidates. The old test was edited from `toBe(2)` to `toBe(1)`. This is justified by the pagination and disclosed in the tool text.
4. **History pages hold at most 10 changes, whatever `limit` asks for.** This is a reasonable byte bound and it is disclosed.
5. **The upload limits went up (8 MB and 20,000 utterances) and uploads now write in batches.** This is within the ticket's scope, but the tool text was not updated (F3).

## 3. Claim verification

| Claim | Supported? |
|---|---|
| A `get` with multiple refs now runs each read as its own nested internal query (`readOne`), and the hosted batch proof passes | **Yes.** `sdk-e2e-initial.log` fails exactly at the multi-ref `get`; `sdk-e2e.log` passes it after `store.ts` moved to `ctx.runQuery(internal.store.readOne…)`. The proof only checks that each item has a continuation; it does not follow one to the end. |
| Native search pagination stopped at 1,024 of 4,800; `find` now scans campaign indexes with byte/row budgets, whole-keyword matching and `type_then_page_relevance`, disclosed in the tools and README | **The code and disclosure match the claim.** The budgets are `maximumRowsRead: 200`, `maximumBytesRead: 500_000` and the `limit`-sized `numItems`. No artifact shows the 1,024 stop itself, but it is consistent with the documented Convex text-search ceiling. |
| Hosted SDK proof passes: 4,801 utterances, original bytes, four scenes, multi-ref `get`, 4,800 search hits and multi-type `find` | **Yes**, in `sdk-e2e.log`. The preview was created fresh just before, so its total of exactly 4,800 is sound. Caveats: the run is on pre-rebase code (F1) and predates the final edits (F6). |
| Endpoint stress test proves 2,005 history changes and 2,004 source hits, and replacement hides old generations | **Yes.** The tests are in `tests/mcp.test.ts` (the ">2000 changes" and "replacing a long transcript" tests). They are red in `red-endpoints.log` and green in `green-endpoints.log` and `check.log`. |
| Full local `pnpm check` passes: 28 tests, Biome, isolated codegen, both typechecks | **Yes for `check.log` at 12:58** (two Biome infos, no errors). It does not cover the `tools.ts` edit at 12:59 (F6). CI has not run. |

## 4. Verdict

**Not ready for the autonomous squash merge yet.**
- The paging that `get` transcript, scene and history now does is correct: no gaps or duplicates on repeated timestamps, an explicit `truncated`/`nextCursor`, invalidation when the transcript is replaced, and bounded reads.
- The acceptance tests and the hosted four-hour proof exist and pass on the pre-rebase code.

Before merge:
1. Rebase onto `origin/main`, resolve the `uploads.ts`, `store.ts` and `search.ts` conflicts, then re-run `pnpm check`, the preview deploy, the long-transcript SDK e2e and the upload-page e2e (F1).
2. Make one `find` call do more than `limit` rows of scanning (F2).
3. Fix the `transcript_upload_url` description (F3) and the retry message (F4).

F5 to F8 can be follow-ups.

**Open question:** I can't tell from the evidence whether you'd accept F2 as disclosed behaviour, since the ticket's wording ("continuation plus an explicit signal") is literally met. I'd treat it as a regression of the debrief's find-by-name step and fix it before merging.
