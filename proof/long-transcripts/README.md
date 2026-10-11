# Long transcripts and history, issue #21

The public boundaries under test are JSON-RPC at the in-process MCP HTTP
route, its signed upload and authenticated download routes, and the official
MCP SDK against an authenticated branch preview. All fixture data is invented.

## Red and green

[red-endpoints.log](red-endpoints.log) runs the original feature branch's 28-test file and
`fixtures/long-session.ts` against the pre-change code at
`3a41cb15a139a6f2d2d097ffb8e46e09cc6a162e` in a detached worktree. Eight tests
fail and 20 pass. It includes the changed list-total contract and the seven
new transcript, history, search, long-upload, scene, large-history, and
replacement tests. Assertions are unchanged between this baseline replay
and the initial [green-endpoints.log](green-endpoints.log).

The initial vertical slices also have focused red/green logs. Focused runs
skip unrelated tests through Vitest's name selector; the full green suite
and [check.log](check.log) run all 48 integrated endpoint tests with none skipped.

| Behavior | Evidence |
| --- | --- |
| Transcript pages, repeated timestamps and timestamp windows | [Baseline red](red-endpoints.log), [green](green-endpoints.log), focused [red](red-transcript.log) / [green](green-transcript.log) |
| Entity history continued with session, scene, basis, quote and why | [Baseline red](red-endpoints.log), [green](green-endpoints.log), focused [red](red-history.log) / [green](green-history.log) |
| Search beyond 200 candidates, distinct utterances sharing a timestamp, exact final totals | [Baseline red](red-endpoints.log), [green](green-endpoints.log), focused [red](red-find.log) / [green](green-find.log) |
| Four-hour upload, full transcript read and scene split at the true end | [Baseline red](red-endpoints.log), [green](green-endpoints.log), focused [red](red-upload.log) / [green](green-upload.log) |
| Scene continuations | [Baseline red](red-endpoints.log), [green](green-endpoints.log), focused [red](red-scene.log) / [green](green-scene.log) |
| 2,005 history changes and 2,004 distinct source hits; replacement hides old generations | [Baseline red](red-endpoints.log), [green](green-endpoints.log) |
| Sparse lookup after 400 misses | [red](red-sparse-search.log) / [green](green-sparse-search.log) |
| Old-shape rows survive deployment upgrade, pagination, search and replacement | [Hosted upgrade](legacy-upgrade.log), [old deployment](legacy-deploy.log), [new deployment](upgrade-deploy.log) |
| Signed-in upload page stores the four-hour file | [Browser log](upload-page-browser.log), [ready screenshot](upload-page/screenshots/05-ready-1280.png), [stored screenshot](upload-page/screenshots/06-stored-1280.png) |
| Cross-family findings and individual dispositions | [Opus review](opus-review.md), [dispositions](review-dispositions.md) |
| Local gate, isolated codegen, both typechecks and complete suite | [pnpm check](check.log) |
| Authenticated SDK, exact bytes, 4,801 utterances, four scenes, independent batch cursors and 4,800 search hits plus sparse final-utterance recall in two requests | [SDK log](sdk-e2e.log), [branch preview deployment](preview-deploy.log) |

## Hosted proof

Run `pnpm exec tsx scripts/e2e-long-transcripts.ts` with the README's staging
preview environment. The fixture spans exactly `04:00:00`, contains 4,801
utterances, five speaker labels, CRLF and continuation lines. The script
compares every returned utterance to the generated input, compares the
concatenation of every scene to the same input, and checks exact file bytes.
The search marker changes per run, so the proof can repeat on a populated
preview. The log identifies the invented session and the file's SHA-256.

`check-initial.log` and `sdk-e2e-initial.log` are exploratory failures, not
final green evidence. Hosted batch reads initially exposed Convex's
single-paginated-query-per-function rule; nested internal read queries fix
it. In-process tests alone did not catch that restriction.

## Read contract decisions

Whole-keyword matching is case-insensitive and drops the documented stop
words. A match to any keyword qualifies. Search visits types in order and
ranks by matched-keyword count within each page. It reports that ordering
explicitly. This replaces globally ranked bounded candidates with complete
recall through byte-bounded campaign-index scans. Convex's
[text-search limits](https://docs.convex.dev/search/text-search#limits) cap
the index at 1,024 results, so its native text-search pagination cannot
retrieve the hosted fixture in full. A request scans up to 4,000 rows, about 4 MB of documents, or 400 internal
pages; it stops sooner when enough hits match. Empty pages still carry a
continuation.

`total` is cumulative and `totalIsExact` becomes true only when no search
stream remains. Complete counts assume the store is unchanged while the
client walks its cursors. The same-ref cursor binds transcript reads to the
stored file, and scene reads to their range. Replacements invalidate earlier
transcript continuations. Optional generation fields retain the read path
for existing stored rows without rewriting them.

The existing overview is a recent summary and the debrief write limits
remain. This ticket does not expand those write contracts. Relationship reads now error explicitly beyond 2,000 rows in either
direction. Final CI and merge deployment are linked from the PR and ticket.
