# Opus review dispositions

The whole diff was reviewed read-only by Claude Opus 5.5 through native T3 delegation and by `claude -p --model claude-opus-5-5` with only Read, Glob and Grep tools. Both initial reviews found no merge blocker. Their original outputs are [native](opus-native-review.md) and [CLI](opus-cli-review.md). The CLI exited zero; neither reviewer edited repository files.

| Native finding | Disposition |
| --- | --- |
| 1, crashed final action strands its claim | Fixed. An explicit index-zero restart cancels the incomplete generation, schedules its bounded cleanup and deletes the old ticket. The old action cannot publish because every batch and finish checks its token. Recovery no longer waits an hour for expiry. |
| 2, extra copies and unproven hosted 8 MB limit | Fixed. Both paths use `storeBytes`; the chunk action no longer constructs a Request or reads it back into an ArrayBuffer. [Hosted maximum proof](sdk-max-bytes.log) uploads exactly 8,000,000 UTF-8 bytes in 125 chunks, stores all 4,801 utterances, reads every byte and utterance in 35 pages, retries and verifies the lock. |
| 3, generic error steers to the page | Fixed. The chunk action supplies its own failure message: retry the identical final chunk or restart from index zero. It never sends the agent to the page while the tool exists. |
| 4, hidden chunk count | Fixed. The tool and all three procedures state the 128-chunk cap; the index error explains restarting with larger chunks. The full 8 MB hosted proof uses 125 chunks. |
| 5, temporary second copy | Rejected as a change request. Keeping the exact chunks makes retries of any accepted index unambiguous. The copy is bounded at 8 MB and expires after one hour. A hash-only representation adds a storage transition to this first tool without changing its user behavior. |
| 6, old final retry reports a later signed replacement | Fixed. A completed ticket must still match the session's current transcript. The replay is rejected with a restart hint after replacement. [Red](06-red-review-replay-unicode.log), [green](06-green-review-replay-unicode.log). |
| 7, repeated lock condition | Fixed. Both paths share exported `isLocked`. |
| 8, README spacing | Fixed. Paragraph spacing was corrected. |
| 9, headless flags and single chunk | Clarified. The no-shell command explicitly disables Bash and all other built-ins. It uploads the short fixture in one tool call. Multi-chunk behavior is demonstrated by the nine-chunk long SDK proof and the 125-chunk maximum proof. There is no claim that the model itself chose multiple chunks. |

| CLI finding | Disposition |
| --- | --- |
| 1, completed-file expiry lacks coverage | Fixed. Fake time runs all scheduled cleanup through convex-test, then MCP reads and authenticated download confirm the completed transcript survives. A new upload is accepted. Expired incomplete staging also rejects and restarts through the endpoint. [Expiry proof](07-green-expiry.log). |
| 2, unexpected failure after the claim lacks an injected test | Rejected as a required additional test. The agreed seam is the endpoint; no test calls domain functions, edits tables or injects faults into internal batches. The proposed scene-lock race permanently locks that session and cannot demonstrate successful recovery. The ticket's resend-after-failure behavior is proved by an invalid final parse, identical resend, preserved earlier bytes and corrected restart, plus an out-of-order failure followed by the missing chunk. Runtime crashes and transient database faults are not deliberately induced in hosted Convex. Explicit restart now cancels stranded work, and `abort` also refuses to clean an already-completed generation after a lost finish response. This coverage limit is stated in the proof README. |
| 3, manual-fallback error message | Fixed, same change as native 3. |
| 4, unproven hosted maximum | Fixed, same change as native 2. |
| 5, claim-to-abort crash gap | Fixed by explicit cancellation, same change as native 1. |
| N1, expiry precedes a completed retry | Fixed. An exact retry of a still-retained completed ticket can return its result before the expiry rejection; scheduled expiry still bounds retention to one hour. |
| N2, old final replay after replacement | Fixed, same change as native 6. |
| N3, split UTF-16 character | Fixed. Unpaired surrogates are rejected before staging with a Unicode hint. [Red](06-red-review-replay-unicode.log), [green](06-green-review-replay-unicode.log). |
| N4, one headless chunk | Clarified, same disposition as native 9. |
| N5, local fixture path and thinking signatures | Thinking blocks were removed from the public recording. The filesystem path is retained as part of the actual curl command; it names only an invented fixture in a temporary worktree. Signed capabilities remain redacted. |
| N6, empty CLI artifact during its execution | Resolved. The CLI review completed and its full output is committed. The reviewer saw its output file while it was still being written. |
| N7, README blank lines | Fixed, same change as native 8. |
| N8, repeated lock | Fixed, same change as native 7. |

CI initially hit the five-second default timeout in the existing 2,005-history-entry coverage, while every new upload test passed. That single intentionally large test now has a 15-second timeout. Its assertions and data volume are unchanged. The final full gate includes it without skips.

Main's independent prep-sparring change, PR #30, was integrated before the final gate and proof. Its procedures and story corrections remain present beside automatic uploads. No other ticket or map was changed.

## Native round two

The [second review](opus-native-review-r2.md) accepted all prior code fixes and the retention and fault-injection dispositions. Its two proof blockers were valid.

The fix also passed [simultaneous maximum run A](sdk-max-concurrent-a.log) and [B](sdk-max-concurrent-b.log). The [server excerpts](sdk-max-rate-limit-recovery.jsonl) show five real rejected batches recovered automatically by the actions, both of which finish without an error. This proves the backoff through the hosted endpoint under actual deployment limits without an internal fault mock.

| Finding | Disposition |
| --- | --- |
| Blocker 1, integrated 8 MB run fails | Fixed. Hosted logs identify the preview's 4 MiB/second database write limit, not a memory ceiling. The original failure is retained with its [diagnosis](sdk-max-rate-limit-diagnosis.md). The shared publication loop retries only this explicit rejected-write error with bounded backoff. The same unchanged maximum fixture passes in [the refreshed run](sdk-max-bytes.log) and [repeat](sdk-max-bytes-repeat.log), each with exact full readback. |
| Blocker 2, stale and uncommitted proofs | Fixed. The canonical no-shell and shell recordings, independent readbacks, standard/max SDK proofs, preview deployment and full local gate are refreshed after integration and the final code changes. All linked files are included in the proof bundle commit. Output tokens are 1,819 without Bash and 1,514 with Bash. |
| Nonblocking 1, in-flight duplicate repeats assembly/storage | Fixed. An incomplete ticket with a storage claim rejects a duplicate before returning a token or running assembly. Its hint says wait and retry, or explicitly cancel through index-zero restart. |
| Nonblocking 2, mismatched duplicate lacks restart hint | Fixed. The error names `restart: true` with index zero. [Endpoint red](08-red-retry-guidance.log) and [green](08-green-retry-guidance.log). |
| Nonblocking 3, one headless chunk and graphical clients | Clarified in the proof README and PR body. The model uploads one short prompt fixture; SDK proves chunking. Graphical clients are not directly tested. |
| Nonblocking 4, signed fallback message | No change requested. Signed upload/page callers retain their appropriate fallback message; the no-shell action supplies automatic retry guidance. |
