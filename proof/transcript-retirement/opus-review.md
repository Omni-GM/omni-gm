I found no blocking issues. The two-stage migration does what it should, published transcripts survive, the signed URL and the upload page still store exact bytes, and the gate is green (69/69, red then green on the tool-absence test). I didn't write, edit or delegate anything.

## Findings

**1. Medium: every future main deploy runs the migration again, with the `uploads` indexes hard-coded.** `scripts/transcript-retirement/schema.ts:7-19`, `scripts/deploy.sh`, `.github/workflows/check.yml:38`
- The temporary schema takes `current.tables` but then replaces `uploads` with a fixed `.index("by_token")` / `.index("by_session")` pair. The README makes `deploy.sh` the permanent main deploy path.
- **Failure scenario:** a later PR adds an index on `uploads` and code that uses it. Stage 1 deploys that code with the index missing, because the temporary schema drops it. Production then throws "index not found" until stage 2 deploys and the index has rebuilt.
- Even with no drift, every deploy adds and drops `transcriptChunks.by_upload_and_index` (the deploy log shows this) and pays for two deploys.
- Both deploys skip typechecking. That's safe only because `deploy-main` needs `check`; anyone running `deploy.sh` by hand loses it.
- **Fix:** make the migration one-off. Either go back to plain `convex deploy --yes` in a follow-up once production has run it, or skip stage 1 when there is nothing to clear. At least build the temporary `uploads` table from the current table definition so its indexes can't drift.

**2. Low: double cleanup for a legacy ticket whose transcript was already replaced.** `scripts/transcript-retirement/clear.ts:35`, `convex/uploads.ts:132`
- The old code never cleaned up a completed chunk ticket. The new check (`storage !== session.transcript`) schedules `uploads.cleanup` for any old chunk upload that a signed upload later replaced.
- When `finish` published that replacement, it already scheduled cleanup for that storage. The second cleanup finds no utterances and calls `ctx.storage.delete` on a file that's already gone.
- Data stays safe, because the check is against the session's current transcript. The likely effect is a failed scheduled function in production logs, if Convex throws on missing storage; I haven't verified that it does.
- **Fix:** in `clear`, skip cleanup when `appendState.completed` is true, which matches the old rule.

**3. Low: no instruction for a client that has a shell but no file on disk.** `convex/skills.ts:9-10`, `convex/tools.ts` (`transcript_upload_url` description)
- The procedure covers "with a shell and a file on disk" and "without a shell". Claude Code with the transcript pasted into chat matches neither. It could write the transcript out with Write or a heredoc into `curl`, which retypes it and costs output tokens, the cost this ticket removes.
- **Fix:** change "Without a shell" to "Otherwise".

**4. Nit: test title overclaims.** `tests/transcript-retirement.test.ts:4`
- The title says clients upload "through a signed URL or page", but the test only checks that the tool is absent. Rename it, for example "the tool list has no chunk tool and calling it fails".
- The exact-byte round-trips are covered by `tests/mcp.test.ts:22` and `tests/upload-page.test.ts:25`.

**5. Nit: dangling line in the README.** `README.md` (Transcripts section): "The page" ends up alone on its own line; reflow the paragraph.

## Checked and fine
- **Cleanup batches:** chunks are deleted first, 100 at a time, and nothing can create new ones after stage 1. Paging through `uploads` resumes safely after earlier rows are deleted. The script fails before stage 2 if `done` never comes, which leaves production on new code with the wider schema, and a re-run is safe.
- **Expiry callbacks:** `expire` and `abort` behave as before for signed tickets. Old one-hour `expire` jobs that fire after the cleanup find no row and do nothing. An old completed ticket expiring between the two stages doesn't delete its published transcript.
- **Interrupted upload still running during the migration:** its next write fails once the ticket is gone, and the cleanup that `clear` scheduled removes the half-written transcript.
- **CI:** main runs are serialized (cancel-in-progress is false for pushes), `jq` is available on the runner, and `oauth:configure` still runs afterwards.
- **No-shell chain:** `transcript_upload_url`, then `pageUrl` in chat, then a stop. The browser upload goes to the same session `k577n…`, and the resume run reads `get transcript` before `scenes_set`, with the bytes confirmed independently. The shell run uses `curl -T`. Signed tokens are redacted in every published proof file.

## Proof gaps
- **Migration coverage:** the preview data had 3 `uploads` rows, so paging across more than 100 rows never ran. The case of an interrupted upload with stored data, the branch that schedules cleanup, wasn't seeded either. The 105 chunks did exercise two chunk batches. `clear.ts` has no in-process test.
- **Production is unproven:** the first real run will be the merge to main.
- **The no-shell run picked up a local hook:** a Convex plugin Stop hook (with a local `/home/coder/.claude/plugins/...` path) adds a second assistant turn about `npx convex dev` in `no-shell.jsonl:12-15`. The checks still hold, but the public proof is noisy. Re-run with hooks and plugins disabled, or note it in the PR.
- **Missing context in the published logs:** the old `command` field is gone and the prompt isn't recorded, so a reader can't see that the transcript was in the agent's context. That context is what makes "did not retype" meaningful. Output tokens are also no longer recorded.
- **AuthKit sign-in** wasn't re-tested, as you said; that's acceptable since it's unchanged.
