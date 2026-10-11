# Review dispositions

Two read-only Claude Opus 5.5 reviews covered the whole implementation against main, ticket #13 and spec #11. The native T3 review also reproduced cases in a scratch copy. The second used the literal `claude -p --model claude-opus-5-5` command with only Read, Grep and Glob tools, no MCP servers. Their full findings are in `opus-native-review.md` and `opus-cli-review.md`. Neither review edited the branch.

## Fixed

- Native 1 / CLI B1: dropping a parent now refuses to invalidate retained changes and names every dependent change ID. Dropping the parent and dependants together works, and the retained draft accepts additions and commits. Red/green 09.
- Native 2: list mode preserves entity-first insertion order; scenes no longer outrank entities. Red/green 10.
- Native 3 / CLI B2: Unicode letter/number tokenization preserves Jörg, Kühn and Straße. Red/green 13; SDK proof also checks hosted Convex against the unrelated name Jara Horn.
- Native 4: entity-specific history links replace campaign-wide scans. The endpoint test commits 2,000 unrelated changes and still reads the NPC's one-entry history. Red/green 11.
- Native 5 / CLI follow-up 6: at most eight search keywords, with a helpful error. Unknown kinds are rejected, duplicates removed, and search kind filters run inside the search index. Red/green 12.
- Native 6: each proposal and lastTime block has a 16 KB cap; a draft has a 512 KB cap and scene descriptions a 64 KB cap. Oversized proposals are rejected individually without losing valid neighbours. Red/green 14.
- Native draft-ID note: direct `entity:draft-c1` references are rejected; temporary entities require `$tempKey`. Red/green 14.
- Native scene-boundary note / CLI follow-up 4: an adjacent scene start belongs only to the next scene. Red/green 15.
- Native overview note / CLI follow-up 3: adventures and commits return newest first. lastTime comes from the latest debrief commit, even when sessions are committed out of creation order. Green 16 and a retrospective red reproduction of the unchanged assertion using `store.ts` from f110ffd.
- Native descriptions note / CLI follow-up 5: debrief_drop describes kept proposals and dependency refusal. The owner test now actually reuses the first caller's MCP transport session under the other identity, and also checks search-mode find, scenes_set, debrief_add and debrief_commit. Green 19.
- CLI follow-up 1: source search keeps each history claim separately, so one entity can return both an NPC claim and a rumor with their own basis. Red/green 17. A relationship claim's ref opens its from entity; that history record includes both endpoints, and the to entity has the same history link.
- Native upload note / CLI follow-up 2: utterances including continuations have a 32 KB cap before storage. Content errors return 400 and leave the capability usable. Only explicit expired/used/locked capability errors return 403; other mutation failures return 500. Red/green 18.
- Native upload cleanup note / CLI follow-up 7: ticket expiry schedules deletion after ten minutes. A successfully used ticket is already deleted; scheduled cleanup tolerates that.
- Native proof-checker note / CLI follow-up 8: the Claude checker scans assistant text and every tool input for transcript reproduction. It still permits short source quotes, as the contract requires.
- Native SDK repeatability note / CLI B4: both scripts locate the NPC using the current proof session's history. The SDK proof ran twice successfully against the same deployment.
- CLI follow-up 9: the gate now explicitly runs tsc with convex/tsconfig.json as well as the root project. TypeScript alone does not sandbox Node imports; the Convex deploy/bundler is the runtime check and the hosted proofs deploy successfully.
- CLI follow-up 10, ordinal refs: `session:1` now strips the prefix before parsing its ordinal. Red/green 15.

## Rejected as blockers, with evidence or scope

- CLI B3, second project: #12 explicitly replaces the spec's `omni-gm-e2e` project with per-branch previews in `omni-gm`. The task dispatch repeats that decision. Reverting it would violate the authorized setup. SDK and Claude deployment logs now name their separate preview targets and the preview-create command; both authenticate with staging M2M. The preview key cannot operate on live.
- Native 8 / CLI B5, missing per-assertion reds: ticket #13 asks for endpoint tests, red then green, covering the listed behaviors. The original endpoint suite has genuine red/green runs 01–04 and 06–08. Expanded rules, owner and atomic assertions passed when added; their green-only provenance is explicit in 05 and 19. No separate red existed for those already-correct assertions, and none is fabricated. Review bug fixes have genuine red/green pairs 09–15 and 17–18. 16 records a retrospective reproduction, not a test-first claim.
- CLI B5, wrong staged green log: the review sampled an intermediate staged copy. The committed f110ffd copy of 06-green-search.log is a passing 11-test run that includes the original search assertion. The final gate is separately recorded in check.log. No failing run is presented as green.
- CLI B5, missing CI link: the first successful PR run is https://github.com/Omni-GM/omni-gm/actions/runs/38137956931. The final run is linked from the PR and ticket before merge. Live deploy proof follows merge as the acceptance criterion requires.
- Native kinds note about source/transcript filtering: spec #11 says kinds limits entity hits. Source and transcript hits therefore remain eligible. Tool descriptions now make that scope explicit.
- Native 7, unwindowed transcript output: the full ref is part of the current contract, and timestamp windows already exist. Pagination is a follow-up for larger campaigns, not a change to this slice's tool contract.
- Native token-randomness note: Convex's UUID operation reads from ChaCha12Rng. Each execution seeds it with 32 bytes from the production runtime's cryptographically secure RNG. It is deterministic for retries but not predictable by a client. See upstream commit 13731cb3af48776bed02dbba06b04790b10ee6ec: [UUID operation](https://github.com/get-convex/convex-backend/blob/13731cb3af48776bed02dbba06b04790b10ee6ec/crates/isolate/src/ops/crypto.rs), [execution seed](https://github.com/get-convex/convex-backend/blob/13731cb3af48776bed02dbba06b04790b10ee6ec/crates/function_runner/src/server.rs#L384), [ChaCha initialization](https://github.com/get-convex/convex-backend/blob/13731cb3af48776bed02dbba06b04790b10ee6ec/crates/isolate/src/environment/udf/phase.rs#L467), [production RNG](https://github.com/get-convex/convex-backend/blob/13731cb3af48776bed02dbba06b04790b10ee6ec/crates/runtime/src/prod.rs#L252). Keep the specified one-mutation write contract.
- Native schema seed note: starter schema is the same typed constant used by validation and get schema, available to every newly seeded campaign. Per-campaign schema evolution belongs to the later schema_change slice. No empty-schema behavior exists for this ticket.
- Native subject scoping note: each deployment trusts one issuer, so subject is sufficient within that deployment. Multiple issuers are outside the setup.
- Native action-tag note: version tags are sufficient for the initial workflow; SHA pinning is optional hardening and does not change this ticket's acceptance.
- CLI follow-up 10, real transcript sizing: this public repository uses invented data only. The documented 2,000-utterance limit is not claimed to cover every real four-hour transcript. Streaming/pagination and higher-capacity ingest remain explicit follow-ups.

## Follow-ups for the conductor

Paginate long transcript/entity-history reads and search; raise ingest/replay capacity when needed; add per-campaign schema evolution in its planned slice; optionally pin CI action SHAs. CodeRabbit skipped the draft PR; the two Opus reviews supply the required other-family review.
