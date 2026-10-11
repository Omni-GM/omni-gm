**Blockers remain: 2.** The core code looks sound. The blockers are both proof integrity: the refreshed proof set in the working tree contradicts what the brief claims.

### Blockers

**1. The refreshed hosted 8 MB proof fails on the integrated preview.**
- **Where:** the working-tree `proof/agent-upload/sdk-max-bytes.log` (unstaged, written 13:55:53).
- **What it shows:** the final `transcript_append` call returned `"Upload failed; retry the identical final chunk, or restart at index 0 to resend all chunks"`. The script's assertion at `scripts/e2e-agent-upload.ts:79` then fails, and the log has no PASS lines.
- **What it contradicts:** the committed HEAD version of that log is a pass (125 chunks, 35 pages). The README table, disposition rows native-2 and CLI-4, and the brief all claim the maximum is proven.
- **Why it matters:** the integrated deployment, `glorious-shrimp-619`, does not reliably store an 8 MB transcript through the tool. The ticket requires the same limits as the signed URL, so an advertised 8 MB that fails, even sometimes, is a real defect.
- **Why the cause is unknown:** that message is the `failed` fallback in `convex/uploads.ts` (the `storeBytes` catch, about lines 356–363). That catch handles any non-capability error from `begin`, `append` or `finish`, and it throws the error away. Nothing in the proof says what failed: an OCC or transient error, a batch rejection, or a resource limit. I could not read the deployment logs (Convex MCP is not authorized).
- **Minimal fix:**
  1. Log the caught error (`console.error`) in the `storeBytes` catch before returning `failed`.
  2. Rerun `--max-bytes` against the integrated preview and read that deployment's logs.
  3. Fix the root cause, or lower the limit advertised for this path if it is a hosted memory or limit ceiling.
  4. Commit a passing log only if it is reproducible. Otherwise keep the failing log, labeled, next to the eventual pass, the way the other authoring-error logs are kept.

  Do not commit the HEAD pass as the "refreshed" proof.

**2. The proof set is half refreshed and not committed.**
- **What is missing:** `no-shell.jsonl` and `no-shell-readback.log` are unchanged since the pre-integration commit. They show no diff against HEAD, and only `shell.*`, `sdk-e2e.log`, `sdk-max-bytes.log` and `preview-deploy.log` changed.
- **What the README claims:** "The canonical recordings and readback logs above are refreshed after the review changes and integration".
- **What else is untracked or unstaged:** `README.md`, `check.log`, `review-dispositions.md` and `preview-before-integration.log` are untracked. The refreshed logs are unstaged. The PR therefore does not yet contain the gate log or the dispositions it cites.
- **Output tokens:** the recordings now say no-shell 1731 and shell 1520. The native review quoted 1679 and 1566 from the first run. That is fine, but the no-shell 1731 comes from the pre-integration run.
- **Minimal fix:** rerun the no-shell headless proof on the integrated preview, or reword the README so it does not claim it was refreshed. Then commit every proof artifact the README links, once blocker 1 is resolved.

### Responses to the prior findings

All of these hold in the code:

- **Explicit restart cancels stranded work.** `transcriptAppend.ts:53-70` schedules cleanup only for an incomplete generation. Deleting the ticket makes the old action's later `begin`, `append` and `finish` fail `checkUpload`, and its `abort` finds no ticket, so nothing happens. Mutations are serialized, so no utterance can be inserted after the cleanup snapshot.
- **`storeBytes` without Request copies.** Confirmed. The hosted run of it is blocker 1.
- **Custom no-shell failure text, the advertised chunk cap, and the shared `isLocked`.** Confirmed.
- **Replay after a signed replacement.** `transcriptAppend.ts:87` compares `ticket.storage` against `s.transcript`, and is checked before the duplicate path.
- **Unicode guard.** The lone-surrogate regex at `:40` is correct for both a split pair and a bare low surrogate.
- **Completed-ticket guards.** `expire` (`uploads.ts:131`) and `abort` (`:220`) both skip cleanup for a completed ticket. `finish` sets `completed` and `transcript` in the same mutation, so an incomplete ticket's storage can never be the live transcript.
- **Expiry ordering (CLI N1).** A completed exact retry returns its result before the expiry check (`:102`), and an incomplete expired one is rejected.
- **Rejecting the retained-text optimization:** accepted. It is bounded at 8 MB for one hour, gives unambiguous exact retries, and is cleaned by `expire` and by restart.
- **Rejecting fault injection:** acceptable at the agreed seam, and it is disclosed in the README.
- **Test timeout:** `tests/mcp.test.ts:1943` has a 15 s timeout with the assertions unchanged. That is fine.

Owner privacy holds:
- `receive` goes through `campaignFor` and `sessionFor`.
- The token is stripped before the action returns.
- Signed URL capabilities in `shell.jsonl` are redacted.
- The only hosts in the proof are the two preview deployments, `glorious-shrimp-619` and the older labeled `nautical-mule-152`.

Convex limits: deleting a restart or expiry batch of at most 128 chunks of 64 KB, and the 8 MB `assembled` read and return, are within per-function limits on paper. Blocker 1 is the open hosted question.

### Nonblocking

1. **A final-chunk retry during an in-flight store redoes all the work.**
   - **Trigger:** a retry arrives while `ticket.storage` is set and `completed` is false.
   - **What happens:** `receive` returns the duplicate path, and the action reassembles, re-parses and stores a full blob (up to 8 MB) before `begin` returns 409.
   - **Why it matters:** the 409 text says "retry the final chunk", so an agent that loops on it multiplies the cost.
   - **Fix:** in `receive`, when `index < nextIndex && ticket.storage && !completed`, throw "Upload in progress; wait and retry the final chunk" before returning a token.
2. **The mismatched-duplicate error has no recovery hint.** At `transcriptAppend.ts:99-101`, a fresh, different upload sent to a session that has a completed ticket gets "Chunk already received with different content or final flag", with no restart hint. Append "; send restart: true with index 0 to replace it".
3. **The headless proofs exercise only one chunk, and not the graphical clients.** This is disclosed in the README; keep the PR body consistent with it.
4. **The signed path's `failed` default** still points to the upload page. That is correct for the URL and page paths, and the tool path overrides it.

No other concurrency, cancellation, finish, abort or expiry defect found. The only blockers are the failing refreshed 8 MB hosted proof and the incomplete or uncommitted proof refresh.
