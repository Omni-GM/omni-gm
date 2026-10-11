I found no merge blockers. Owner scoping, chunk order, identical duplicates, a missing chunk, a resend after a parse failure, final replay, restart racing the final chunk, a signed-URL replacement during an append, Unicode and CRLF bytes, and the size and utterance limits all hold. I checked them in `convex/transcriptAppend.ts` and `convex/uploads.ts` against the endpoint tests and the hosted proof. The gaps below are test coverage, one misleading message, and one unproven hosted limit.

## Findings

**1. Medium: the guard that keeps a finished transcript alive at expiry has no test**
- **Where:** `convex/uploads.ts:131`. A chunk upload's record now stays for an hour after it finishes, and `expire` must skip the cleanup when `appendState.completed` is set.
- **Trigger:** if that `&& !row.appendState?.completed` check regresses, the cleanup runs an hour after every successful chunk upload. It deletes the session's live transcript file and its utterances. `pnpm check` stays green, because no test advances time.
- **Two more untested paths:**
  - the "Chunk upload expired" rejection (`transcriptAppend.ts:75`);
  - a restart after expiry.
- **Smallest fix:** one convex-test case with fake timers:
  1. Finish a chunk upload.
  2. Advance 60 minutes and run the scheduled functions.
  3. Assert `get transcript:<id>` and the download still return the original bytes.
  4. Assert a fresh index-0 upload is accepted.

**2. Medium: the failure-after-claim recovery path has no test**
- **Where:** `convex/uploads.ts:226-231`. The new `abort` branch keeps a chunk upload's record and clears `storage` and `count`, so the final chunk can be resent.
- **Trigger:** the "resend after a failure" test (`tests/transcript-append.test.ts:920`) fails at parse time. That happens before `begin`, so `abort` never runs. If the branch regresses to deleting the record, a resent final chunk gets "Upload is incomplete" and the agent has to restart from index 0. If it stops clearing `storage`, every resend and restart is refused with "in progress" until expiry.
- **Smallest fix:** one test where the store step fails after it has claimed the upload. For example, call `scenes_set` on an existing transcript between `receive` and `finish`, or patch a batch to fail. Then assert that resending the final chunk, or a restart, publishes.

**3. Low–medium: the generic failure message tells the agent to hand off the upload page**
- **Where:** `convex/uploads.ts:347-350`, which `transcriptAppend.ts:170` rethrows as is.
- **Trigger:** any non-capability error inside the store step, such as a failed batch insert or a storage error. The agent receives "Upload failed; request a new upload URL or retry from the upload page".
- **Why it matters:** #26 says the agent must never send the game master to the page while a tool path exists. The right recovery is to resend the final chunk, because `abort` clears the claim.
- **Smallest fix:** add a `failed` message parameter to `storeTranscript`, as was done for `refused`. Have `append` pass "Upload failed; retry the final chunk".

**4. Low–medium: an 8 MB chunk upload is not proven on a hosted deployment**
- **Where:** `transcriptAppend.ts:336-351` and `:145-172`.
- **What's at risk:** at the limit, one action holds:
  - the `assembled` query's return value (up to 8,000,000 bytes, from 128 rows of about 64 KB);
  - the joined string;
  - the `Request` body;
  - the decoded text, the parsed utterances, and the `Blob`.
- **Trigger:** the read and return sizes fit Convex's per-function limits. The extra copies on top of what the signed path already holds could push the action toward its memory limit. convex-test does not enforce these limits, and the SDK e2e only uploaded 555 KB.
- **Smallest fix:** one hosted run of `scripts/e2e-agent-upload.ts` with a fixture near 7.9 MB, recorded in the proof. Optionally, skip the `Request` and pass the encoded bytes to the store step directly.

**5. Low: a crash between claim and abort blocks recovery for up to an hour**
- **Where:** `transcriptAppend.ts:47`.
- **Trigger:** the action dies (timeout or runtime crash) after `begin` and before `abort` runs. `storage` stays set, so:
  - `restart` returns "Upload in progress; retry after it finishes";
  - resending the final chunk returns 409 from `begin`;
  - nothing recovers until `expire` runs, up to 60 minutes after the first chunk.
- The signed path has the same shape, but only for 10 minutes. This is rare, so it does not block the merge.
- **Smallest fix:** let `restart` take over a record that is still claimed but incomplete. Schedule `cleanup` for its `storage` instead of refusing.

## Nits
- **N1:** `transcriptAppend.ts:75` checks expiry before the duplicate path. So a finished upload whose expiry has not run yet answers a lost-reply final retry with "expired" instead of `uploaded: true`. Moving the check below the duplicate return fixes it.
- **N2:** after a signed-URL replacement, retrying the old chunk upload's final chunk still returns `uploaded: true`, although the stored transcript is now the signed file. It is harmless, but it is not strictly true.
- **N3:** a chunk ending in half of a UTF-16 surrogate pair is not rejected. `TextEncoder` counts it as 3 replacement bytes, so `bytes` is overcounted, and storing it may fail with an unclear Convex error. Checking `chunk.isWellFormed()` would give a clear message.
- **N4:** the headless no-shell proof uploads the 692-byte fixture in one chunk. The ticket asks for this fixture, so it's fine, but no agent ever chose multiple chunks. Only the SDK script did.
- **N5:**
  - `proof/agent-upload/shell.jsonl` includes the local path `/tmp/omnigm-impl26/fixtures/session.txt`.
  - Both `.jsonl` files keep opaque thinking `signature` blobs. They aren't sensitive, but they're noise; the sanitizer could drop `thinking` blocks.
  - The signed-URL tokens are redacted, and the deployment hostnames follow earlier proofs.
  - I found no bearer tokens or keys, and all fixtures are invented.
- **N6:** `proof/agent-upload/opus-cli-review.md` is empty and untracked. The cross-model review evidence is missing.
- **N7:** `README.md` has a double blank line before "For agent upload proof…".
- **N8:** `receive` (`transcriptAppend.ts:31`) repeats `isLocked`/`checkSession` from `uploads.ts` inline. Exporting `isLocked` would remove the copy.
