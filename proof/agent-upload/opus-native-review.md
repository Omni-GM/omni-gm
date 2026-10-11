**No blockers.** I reviewed the whole staged diff against `origin/main` (d3e5d1e), with the #26 and spec oracles. I found no correctness, owner-scoping, byte-exactness or private-data defect that should hold the merge.

**What I checked and confirmed holds:**
- **Owner scoping:** the chunk tool goes through `campaignFor` and then `sessionFor`, so another owner gets "Session not found".
- **Token stays internal:** the internal token never leaves the server. The `append` action strips it before returning, and no endpoint exposes it to a client.
- **Concurrent first chunks:** Convex mutations serialize, so two first chunks racing cannot create two upload tickets.
- **Duplicate final chunks:** they race safely. One call claims the store through `begin`, and the other gets a 409.
- **Restart during a store:** a restart in the middle of a final store makes the old call's `begin` fail, because its token no longer exists.
- **Lock:** the lock is checked both in `receive` and again in `begin`.
- **Byte-exactness:** the chunks are joined and then stored the same way as the signed URL. The in-process test compares the stored file against the signed-URL path, including CRLF and emoji. The hosted SDK proof does the same at 555 KB.
- **Proof contents:** the signed-URL token is redacted in `shell.jsonl`. The only URLs in the proof are the preview deployment's, and the fixtures are invented.
- **Headless runs:** the verifier asserts the model is `claude-sonnet-5-5`, that Bash is absent in the no-shell run, and that `split-scenes` loads before the first write. It also reads the result back independently. Output tokens are recorded: 1679 without a shell, 1566 with one.
- **Gate:** `check-pre-review.log` is green (57 tests). I re-ran `tests/transcript-append.test.ts` and `tests/upload-page.test.ts` myself: 13 of 13 pass.

## Non-blocking findings

1. **Medium: a crashed final store blocks the agent for up to an hour.** `convex/transcriptAppend.ts:47-48`, with `uploads.ts:306-338`.
   - **How it happens:**
     1. The final chunk's action passes `begin`, so `ticket.storage` is set.
     2. The action then dies without reaching its `catch`, for example from an action timeout or running out of memory on a large transcript (see finding 2).
     3. `abort` never runs, so `storage` stays set and `completed` stays false.
     4. Retrying the final chunk now fails at `begin` with 409 "Upload in progress". A `restart: true` is refused with "Upload in progress; retry after it finishes".
     5. Nothing recovers until `expire` runs, up to 60 minutes after the first chunk. A no-shell agent cannot make progress in that time.
   - **Smallest fix:** record a claim time in `appendState` when `begin` runs. Let `restart` (and a final retry) take over a claim older than the action limit, about 10 minutes, and schedule `cleanup` for the stale storage.

2. **Medium: the 8 MB limit is not proven on hosted Convex, and this path needs more memory than the signed URL.** `transcriptAppend.ts:136-141` and `:157-167`.
   - **What the path holds at once:**
     - the assembled string from `runQuery`, up to about 16 MB in UTF-16;
     - a `Request` body built from that string, 8 MB;
     - `arrayBuffer()`, another 8 MB;
     - the decoded text and the parsed utterances that the signed path also holds.
   - **Why it matters:** convex-test enforces no limits, and the hosted proof is only 555 KB. Near 8 MB, this can exceed the action's memory limit, which then triggers finding 1.
   - **Smallest fix:** split `storeTranscript` so the chunk path passes its bytes in directly, for example `storeBytes(ctx, token, body: Uint8Array, refused)`, instead of building a `Request`. Then run one hosted proof near 8 MB, or lower the advertised limit for this path.

3. **Low: a failure message sends the no-shell agent to the manual fallback.** `uploads.ts:347-349`.
   - **How it happens:** any non-capability error in the middle of a store, such as a transient mutation failure, returns "Upload failed; request a new upload URL or retry from the upload page". The `append` action re-throws that text unchanged at `:168`.
   - **Why it matters:** it tells the agent to ask the game master to use the upload page, which the ticket forbids when a tool path exists.
   - **Smallest fix:** pass the failure text in as a parameter, like `refused`, and for `transcript_append` say "retry the final chunk".

4. **Low: the 128-chunk cap means smaller chunks reach a lower total limit.** `transcriptAppend.ts:35-36`.
   - **How it happens:** an agent that sends 20 KB chunks hits "Chunk index must be an integer from 0 to 127" at about 2.5 MB. The tool description still promises "At most 8 MB". The error does not tell the agent to restart with larger chunks.
   - **Smallest fix:** add "or restart with larger chunks (up to 64000 bytes)" to the error. Or state the 128-chunk cap in the tool description; the README already does.

## Nits

5. **Chunk text kept after completion.** After `finish`, the ticket and the full chunk text stay until `expire`, up to an hour (`uploads.ts:201-205`). That is a second copy of the transcript. It is only needed to compare a retried final chunk. A content hash per chunk, or clearing `text` on completion, would remove the copy.
6. **Retry reports a replaced transcript.** A completed chunk ticket can return `uploaded: true` on an identical retry even after a later signed-URL upload replaced the transcript. This is harmless but not strictly true.
7. **Duplicated lock check.** `receive` repeats the lock condition inline. `isLocked` in `uploads.ts` could be exported and reused.
8. **README spacing.**
   - Line 51: the "refuses other owners' sessions." paragraph now runs straight into "Use UTF-8 text…" with no blank line.
   - Line ~273: there is a double blank line before "For agent upload proof".
9. **Proof command differs from the ticket's literal flags.** The no-shell proof ran with `--tools '' --disallowedTools Bash` (all built-in tools off). That is stricter than the ticket's literal `--disallowedTools Bash` and still meets it. The no-shell upload was a single chunk, and the multi-chunk behaviour is covered by the SDK e2e. The PR description should say both so a reader does not assume the headless run exercised chunking.
