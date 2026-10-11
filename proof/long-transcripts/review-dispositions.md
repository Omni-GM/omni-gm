# Opus review dispositions

One cross-family review ran read-only with `claude -p --model claude-opus-5-5`
and plan permissions. It exited 0 and changed no repository files. The
[raw review](opus-review.md) covers the original diff against its branch base,
with issues #21 and #11 as the oracle. The following dispositions cover the
integrated tree after the review.

| Finding | Disposition and evidence |
| --- | --- |
| F1, behind main and conflicting upload/schema paths | Fixed. Integrated main through `9ddd09f`, retaining schema changes, signed-in upload, Ledger and frame talk. The signed-in page and signed URL use the same batched ingestion. Search validates kinds with `schemaFor(campaign)`. [Final gate](check.log), [hosted SDK](sdk-e2e.log), and [browser proof](upload-page-browser.log) exercise the integration. |
| F2, sparse searches scan only one limit-sized chunk | Fixed. A request continues internal paginated queries until its hits fill, or it scans 4,000 rows, about 4 MB of documents, or 400 internal pages. Transcript visibility reads cache each session per chunk and count its bytes. One chunk may cross the byte budget. The cursor retains the first unread position. [Red](red-sparse-search.log) and [green](green-sparse-search.log) prove a match after 400 misses in one request; [hosted SDK](sdk-e2e.log) finds the unique last utterance of the four-hour session in two requests. |
| F3, stale upload tool capacity | Fixed. The tool, served procedures, README and upload page advertise 8 MB and 20,000 utterances. |
| F4, retry advice names a consumed capability | Fixed. An unexpected ingestion failure now tells clients to request a new upload URL or retry from the signed-in page, which issues a fresh capability. Invalid content still leaves an unclaimed URL reusable. |
| F5, legacy rows have no executable compatibility proof | Fixed through the public seams. Deployed main `67c7c30` to an isolated preview, uploaded 250 old-shape rows with repeated timestamps via MCP, then deployed this branch with `--preview-name` to retain data. [Upgrade proof](legacy-upgrade.log) reads every row and original byte, searches all 250, replaces the transcript, and confirms old hits and cursors no longer work. No test inserts or inspects database rows. [Baseline deployment](legacy-deploy.log), [upgrade deployment](upgrade-deploy.log). |
| F6, proof predates final edits | Fixed. Refreshed the full gate and hosted proof after integration and production changes. Scripts and prose are covered by the final gate. |
| F7, relationship and overview caps | Relationships now probe 2,001 rows and return an explicit error beyond 2,000 in either direction. Overview remains the documented summary of 200 recent records; expanding overview and the existing debrief write caps is outside this ticket's transcript/history/find paths. Complete history and search have continuations. |
| F8, index/style/cursor nits | Removed the unused `by_session_and_seconds` index and restored the upload template literal. The cursor deliberately contains non-capability IDs; reads remain campaign-scoped and forged cumulative counts affect only that client's display. The reviewer explicitly found no security issue, so no cursor encryption was added. |

The disclosed search contract visits types in order and ranks by keyword
matches within each returned page. Whole-keyword matching and cumulative
`total` are intentional. Native Convex text search caps results at 1,024,
so complete recall uses bounded campaign-index scans. There is no claim of
global relevance ordering or a snapshot across calls. Overview and debrief
write-capacity expansion remain follow-ups, not part of the accepted read
contracts.
