# Frame talk review dispositions

The T3-native and literal `claude -p --model claude-opus-5-5` reviews were read-only. Both reviewed the entire implementation against `origin/main`, ticket #14 and spec #11. They found no blocking code defect. Their proof findings describe intermediate files while the proof runs were still being regenerated. The final bundle below replaces those intermediate files.

| Finding | Disposition |
| --- | --- |
| Native P1 / CLI B1: hooks, German replies and stale headless artifacts | Fixed. Re-ran seed, before snapshot, headless client and independent readback in order on a fresh staging preview. The client loads only the Omni-GM MCP configuration, disables all hooks, uses an explicit neutral client system prompt and the English fixture. The final transcript is English, contains no operator hook feedback or reminders, and the readback passes. User settings are retained solely to use the configured provider authentication. No built-in tools are exposed to the model. |
| Native P1 / CLI B1: inconsistent before snapshot, adventure and transcript | Fixed. The final preview starts empty; the fixture seed creates one adventure. Its before snapshot precedes the final transcript; independent readback verifies one frame commit, exact answers and unchanged story state. |
| CLI M1: SDK target and deploy provenance unclear | Fixed. Re-ran the SDK proof after the final deployment. Both proof scripts now print the public preview origin. SDK target is `moonlit-hornet-204`; headless target is `shocking-chihuahua-512`. Each matches its deployment log. |
| Native P3: batched entity reads unsupported by verifier | Fixed by removing an unnecessary proof condition. The verifier accepts both `ref` and `refs` for the required frame and overview reads. This fixture already supplies every answer and satisfaction, so it requires no further questions or entity lookup. The actual client uses the overview's plot-first lastTime, which includes the named gate clock. We do not claim a multi-turn grounded-question proof. |
| Native P3: fixture coaches entity reads | Fixed. Removed the extra instruction to read named entities. The fixture now supplies only the task, language, answers, satisfaction and unset-field preference. Loading the matching skill remains the server's standing workflow instruction. |
| Native P3: empty-string clearing was undocumented in storage terms and untested | Fixed. README specifies that clearing stores `""`. The endpoint test now checks an empty timeframe, the other seven preserved fields and the history before/after. This is green-only coverage of already-correct behavior. |
| CLI L2: unknown-field rejection asserted without a message | Fixed. The endpoint test now checks the gateway's actual `Tool execution failed` response, and tools/list must advertise exactly the eight allowed fields with additionalProperties false. The gateway intentionally wraps nested Convex validator errors, so the response cannot name `outcome` without changing the gateway. |
| Native P3 / CLI L3: overview's recent commit list is bounded at 200 | Rejected as a blocker. This is the existing documented compact overview contract. Frame history is read separately by adventure. The actual recall regression was fixed test-first with an indexed latest-debrief lookup, so frame commits cannot erase lastTime. Paginated history remains #21's capacity work. |
| Native P3 / CLI L4: whitespace and no-op intent can be saved | Rejected. The spec preserves the game master's words and does not require normalization or no-op suppression. An explicit reaffirmation with a reason may legitimately be retained as a frame commit. Missing fields and blank reasons are rejected. |
| Native P3 / CLI L5: first-use get frame has no current adventure | Rejected. Frame reads and writes are explicitly for the current adventure. No campaign returns the existing adventure_start hint. The served procedure handles first use and requires the game master's answer before creating an adventure. |
| Native P3: skill list order | Rejected. No contract assigns an ordering to the skill catalogue. The endpoint lists and loosely loads frame-talk correctly. |
| CLI L1: zero questions is narrower than a grounded interview proof | Accepted limitation. All answers and satisfaction are supplied up front as #14 requires. The transcript proves no outcome questions and exact stored intent. The endpoint verifies the served procedure contains the grounded-question and stopping rules; no multi-turn behavior claim is made. |
| CLI L6: frame history read capacity is 2,000 commits | Accepted documented limit. It rejects beyond that capacity rather than silently truncating. Larger paginated reads remain capacity follow-up work. |
| Review note: previews replace the spec's second e2e project | Rejected as a discrepancy to resolve here. Map #1 and #12 approve per-branch staging previews, and the implementation brief explicitly requires them. No unmerged branch was deployed to live. |

The full local gate is rerun after these dispositions. No finding remains undecided. The required other-family review was Claude Opus 5.5. CodeRabbit began its automatic review after the PR opened; its final status is recorded on the ticket.

## Reconciliation with schema changes on main

Merged `9b8da65` from origin/main before landing. Kept the campaign schema, schema-change commits and dynamic schema reads from #22, added frame to the shared commit validator, and retained both tools, documentation sections and test groups. Both tickets independently exposed the latest-debrief recall issue; the merged branch uses #22's identical indexed lookup. The final diff therefore preserves that lookup instead of adding a second one.

The full gate passes 34 endpoint tests. The acceptance test and refreshed SDK proof also keep a custom campaign schema unchanged across frame writes. Both SDK and headless proofs were rerun on fresh previews of the reconciled code.

## Final review and upload-page reconciliation

The final read-only T3 Opus review (`opus-final-review.md`) approves the implementation and confirms all three acceptance criteria. Its M1 anticipated #23's move of the MCP client helpers. After incorporating `16f7904`, fixed the `createTest` import, preserved the upload page and both procedures, resolved README to list only corrections and the Ledger as later slices, and fixed the missing blank line before the schema heading. The full local gate now passes 38 tests.

M1's proof-replay choice is an implementation decision covered by the autonomous brief, so no human decision is needed. Both hosted proofs are rerun from the committed combined code. L1's provenance gap is addressed by recording the source SHA in each deployment log; L2's narrower up-front-answer proof remains an explicit accepted limitation. CodeRabbit's automatic review reported no actionable comments.

## Ledger reconciliation

Merged `c39a7a5` from origin/main. The three conflicts were adjacent additions: retained both frame and Ledger validators, both tool imports and the Ledger documentation, and removed the stale statements that frame and Ledger were future work. The Ledger's MCP metadata, row results and build step are intact. Installed its locked dependencies and ran the full gate, including the Ledger bundle and all 40 tests. The final frame increment against main is unchanged in behavior. Both hosted frame proofs are rerun from this committed combined source.
