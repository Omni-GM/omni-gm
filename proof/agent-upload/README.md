# Agent upload proof

Ticket [#26](https://github.com/Omni-GM/omni-gm/issues/26), PR [#31](https://github.com/Omni-GM/omni-gm/pull/31). All transcript fixtures are invented. Every hosted run targets only a branch preview and signs in with the staging M2M identity.

The behavioral seams are the gateway's HTTP JSON-RPC endpoint in convex-test, signed upload and authenticated download routes, a hosted official SDK client, and an actual headless AI client. No test calls internal domain functions or reads tables.

| Acceptance | Artifact |
| --- | --- |
| Byte-exact parity with the signed path, parsed utterances, CRLF and Unicode | [Red](01-red-exact.log), [green](01-green-exact.log) and `tests/transcript-append.test.ts` |
| Duplicate chunks, lost final reply, mismatched duplicate | [Red](02-red-retry.log), [green](02-green-retry.log) |
| Resend after failure, preserved earlier file, corrected restart | [Red](03-red-restart.log), [green](03-green-restart.log) |
| Missing/out-of-order chunks, owner scoping, scene lock, UTF-8 chunk and 8 MB limits, parser's order/32 KB/20,000-utterance limits | [Endpoint green](04-green-bounds-isolation-order.log). These inherited shared-pipeline guards were already green after the tool's first implementation; no separate failing guard history is claimed. |
| Automatic path instructions in all three skills and both tools | [Red](05-red-procedures.log), [green](05-green-procedures.log) |
| Full final endpoint suite on the pre-feature base | [Baseline replay](baseline-suite-red-final.log): 14 failures, 3 existing upload-page tests pass. Baseline `d3e5d1e` had no transcript_append tool. This is a later replay of the unchanged final assertions, distinct from the historical per-slice red/green runs. |
| Hosted invented long transcript, read back in full | [SDK e2e](sdk-e2e.log), nine chunks, 4,801 utterances over four hours, 25 complete readback pages, original bytes, duplicate retries and scene lock |
| Full advertised hosted byte limit | [SDK maximum](sdk-max-bytes.log) and [repeat](sdk-max-bytes-repeat.log), each exactly 8,000,000 bytes, 125 chunks and 35 complete readback pages. Every utterance is padded, so the whole file is parsed and stored as utterances. The actual earlier [failure](sdk-max-rate-limit-failure.log) and [diagnosis](sdk-max-rate-limit-diagnosis.md) remain visible. |
| Actual hosted write-rate recovery | Simultaneous maximum runs [A](sdk-max-concurrent-a.log) and [B](sdk-max-concurrent-b.log) both pass exact readback. [Server excerpts](sdk-max-rate-limit-recovery.jsonl) show five actual rejected batches and corresponding automatic retry warnings, with no final action error. |
| No-shell agent uploads itself while running split-scenes | [No-shell recording](no-shell.jsonl) and [independent SDK readback](no-shell-readback.log). Actual `claude -p --model claude-sonnet-5-5 --tools '' --disallowedTools Bash`; all available tools are MCP tools, no question or human handoff. The short prompt fixture is uploaded in one tool call. |
| Shell agent keeps direct signed upload and no transcript output | [Shell recording](shell.jsonl) and [independent SDK readback](shell-readback.log). Actual Sonnet 5.5 run with Bash available, using `curl -sT` from disk, no transcript lines in assistant text or tool arguments. |
| Local gate | [pnpm check](check.log), including all tests without skips, Biome, isolated anonymous codegen and both typechecks |
| Cross-family review | [Native Opus 5.5](opus-native-review.md), [literal CLI Opus 5.5](opus-cli-review.md), [native round two](opus-native-review-r2.md), [final native review](opus-native-review-r3.md), [finding dispositions](review-dispositions.md) |
| Review fixes: stale final after replacement and invalid Unicode | [Red](06-red-review-replay-unicode.log), [green](06-green-review-replay-unicode.log) |
| Completed storage survives scheduled expiry; expired staging restarts | [Expiry endpoint proof](07-green-expiry.log) |
| Mismatched retries explain automatic restart | [Red](08-red-retry-guidance.log), [green](08-green-retry-guidance.log) |
| CI and merged deployment | Linked from the ticket's resolution comment at their immutable run and merged-commit URLs |

`preview-deploy.log` identifies the final integrated proof deployment. Earlier preview records are retained and labeled. The initial headless proof numbers cited by the first reviews refer to the earlier records in the PR's first commit. The canonical recordings and readback logs above are refreshed after the review changes and integration; their result events record the requested output-token totals. Upload capability values, unrelated provider usage, local runtime initialization details and thinking blocks are removed from the public records. Tool inputs, results, assistant text and the requested output-token total remain.

`04-test-authoring-error.log` records an incorrect test expectation for reading a missing transcript, and `shell-verifier-authoring-error.log` records a verifier regex that originally missed curl's valid `-sT` combined flags. `sdk-max-fixture-authoring-error.log` records a character-padding mistake that constructed 8,000,005 bytes and was correctly rejected. These are observation/fixture mistakes, not fabricated production red evidence. The final assertions and verifier are unchanged across their baseline/green comparisons.

## Reproduce

The final no-shell recording uses 1,819 output tokens; the final shell recording uses 1,514. Both independent readbacks pass against the integrated preview after the write-rate retry fix.

```sh
pnpm install --frozen-lockfile
pnpm check
OMNI_GM_MCP_URL=https://<preview>.convex.site/mcp \
  OMNI_GM_ACCESS_TOKEN=<staging-token> \
  pnpm exec tsx scripts/e2e-agent-upload.ts
OMNI_GM_MCP_URL=https://<preview>.convex.site/mcp \
  OMNI_GM_ACCESS_TOKEN=<staging-token> \
  pnpm exec tsx scripts/e2e-agent-upload.ts --max-bytes
```

Headless runs use a temporary mode-600 MCP config containing only the preview's HTTP connection and staging token, strict MCP config, user settings with hooks disabled, and an isolated client directory. The no-shell prompt contains `fixtures/session.txt` verbatim between BEGIN/END markers, including its trailing newline, and asks to run split-scenes, create the adventure/session, upload and store scenes without debriefing. The shell prompt gives only that file's absolute path and the same workflow. It never gives the transcript to the model before upload.

Check a raw headless recording and produce the safe public one with:

```sh
OMNI_GM_MCP_URL=https://<preview>.convex.site/mcp \
  OMNI_GM_ACCESS_TOKEN=<staging-token> \
  pnpm exec tsx scripts/verify-agent-upload.ts \
  no-shell <private-raw.jsonl> <public-recording.jsonl>
```

Use `shell` for the shell run. The verifier checks model, available tools, procedure order, upload path, exact input reconstruction for the no-shell run, absence of transcript echoes, final success, output-token usage and independent signed-in readback of every fixture byte, parsed utterance count and saved scenes.

No remote action timeout, process crash or transient database failure is deliberately injected. Failure recovery is exercised at the public seam with invalid parse input and out-of-order chunks. Explicit restart can also cancel incomplete work, and token checks prevent its cancelled generation from publishing. The headless proof covers one no-shell MCP client, not the graphical Claude Desktop or claude.ai application; both use the same available MCP tool contract.

The in-flight duplicate guard is inspected in the final code review, with no dedicated concurrent endpoint test. Hosted simultaneous maximum uploads prove the current Convex write-rate rejection and automatic retry; the classifier depends on the observed error phrase. The shell recording retains one failed call to an unavailable `get` tool followed by successful recovery. CodeRabbit skipped review because the PR remained draft.
