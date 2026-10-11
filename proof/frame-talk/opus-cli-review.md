# Review: Omni-GM #14, frame talk (`omni-gm-frame-talk` against `origin/main`, tracked and untracked)

**Verdict:** I found no blocking defect in the code. The frame fields, partial updates, the atomic frame commit with before/after and reason, `get frame` and `get overview`, owner and adventure scoping, and the separation from story state all match spec #11.

**The ticket is still blocked on acceptance criterion 3.** The headless frame-talk proof on disk is stale and fails its own verifier. The SDK e2e log also doesn't clearly belong to the deployed code. Details are in B1 and M1.

I reviewed the diff of `README.md` and `convex/{model,schema,store,tools,skills}.ts`, plus `tests/mcp.test.ts`, the untracked scripts, the fixture and `proof/frame-talk/`. I did not run the gate. `proof/frame-talk/check.log` shows 25/25 tests passing and one existing Biome info at `tests/mcp.test.ts:768`.

## Acceptance criteria

| AC | Status | Evidence |
|---|---|---|
| 1. Endpoint tests: only the given fields change, a frame commit with its reason is in the history, story state untouched | ✅ Met | `tests/mcp.test.ts:885`, `:961`, `:1050`. Red logs `01`–`04` fail for the right reasons; `green-endpoint.log` and `check.log` pass. |
| 2. SDK e2e on the e2e deployment, linked | ⚠️ Provenance unclear | `scripts/frame-e2e.ts` is sound; `sdk-e2e.log` predates the deploy log (M1). |
| 3. Headless frame talk on the fixture, linked | ❌ Not proven | B1 |

## Blocker

### B1: The headless proof bundle is stale, doesn't fit together, and fails the current verifier
**Files:** `proof/frame-talk/claude.jsonl`, `claude-readback.log`, `claude-seed.log`, `claude-story-before.json`, `scripts/verify-frame-talk.ts:75,136`

How to reproduce it from the files on disk:
1. **The verifier fails on this transcript.** `claude.jsonl` (written 12:38:54) contains a user turn starting `"Stop hook feedback: [node …/plugins/cache/claude-plugins-official/convex/1.14.0/hooks/convex-typecheck.mjs] …"` (`grep -c` gives 1). The verifier asserts at `verify-frame-talk.ts:75` that this text is absent, so it fails.
2. **The saved readback is a failure.** `claude-readback.log` holds an `AssertionError` from an earlier version of the verifier. No log on disk shows `HEADLESS FRAME TALK PROOF PASSED`.
3. **The "before" snapshot was taken after the run.** `claude-seed.log` and `claude-story-before.json` were written at 12:41:39–42, three minutes after the transcript. The snapshot contains session `k574tvdr…`, which is the session `claude-seed.log` created at 12:41. So the "story state unchanged" comparison would compare the deployment with itself after the run, which proves nothing.
4. **The verifier now reads the wrong adventure.** The snapshot lists three adventures (`j5715…`, `j573m…`, `j579d…`), and the transcript wrote to `j573m…`. Every `pnpm e2e` seed calls `adventure_start`, which moves the current adventure. After the 12:41 re-seed, `get frame` reads a different adventure, so the `frame.fields` / `history.length === 1` checks (`verify-frame-talk.ts:~150`) can't pass against this transcript.
5. **The run wasn't isolated and broke a standing rule.** It ran inside the repo worktree with the operator's plugins and hooks loaded. Every assistant text is German, although `fixtures/frame-talk-answers.md` says "Write in English." That breaks "Write in the game master's language." The last turn also talks about worktree files and `npx convex dev`, which doesn't belong in a game master's transcript.

**Fix:** in one sequence, on one preview: seed → `verify-frame-talk.ts --before` → headless run from an empty directory outside the repo (only the omni-gm MCP config, no user settings or hooks) → readback. Keep only a set whose readback prints `HEADLESS FRAME TALK PROOF PASSED`. A fresh preview, or a seed that doesn't start a new adventure between the snapshot and the run, avoids the moving current adventure.

## Medium

### M1: The SDK e2e log may not be from the deployed code
**Files:** `proof/frame-talk/sdk-e2e.log` (12:36:46), `sdk-seed.log` (12:36:42), `sdk-preview-deploy.log` (12:40:03, `astute-oriole-812`)

- The e2e ran 3.5 minutes before the deploy log was written.
- It also ran between `04-red-last-time.log` (12:36:38) and `green-endpoint.log` (12:36:56), so it may have run before the `by_campaign_and_kind` lastTime fix was deployed.
- `sdk-e2e.log` doesn't name its target. The README says "Deployment logs identify each proof target," and here they don't line up. The earlier review in the same folder names a different deployment (`nautical-crocodile-659`).

**Fix:** re-run `pnpm e2e` and then `frame-e2e.ts` after the final deploy, and print the target host in the log.

## Low

| # | Where | Finding |
|---|---|---|
| L1 | `scripts/verify-frame-talk.ts:136` | `texts.every(t => !t.includes("?"))` checks "no outcome questions" only by checking that there are no questions at all. That fits the ticket ("answers given up front"), but the proof never shows a grounded question. It also fails on any harmless `?`, like a quoted title. Say this in the PR. |
| L2 | `tests/mcp.test.ts:988` | `.rejects.toThrow()` with no message for `fields: {outcome: …}`. Any error passes, so this doesn't prove the validator rejected the unknown field. Assert on the validator text. |
| L3 | `convex/store.ts:230-240`, `tests/mcp.test.ts:~940` | `overview.commits` still uses `take(200)` across all kinds, so 200 frame edits push every seed and debrief commit out of the overview. `lastTime` is safe now (`:1050` covers it); only the commit list is affected. The endpoint test even asserts that frame commits show up there. |
| L4 | `convex/store.ts:49-74` | Whitespace-only values (`goal: "  "`) are accepted, and a no-op update adds a commit whose before and after are identical, which clutters the history the game master reads. The spec doesn't require handling this. |
| L5 | `convex/skills.ts:13`, `convex/store.ts:195` | The procedure starts with `get frame`, which throws `Call adventure_start first` when there is no adventure. `get overview` returns `frame: null` instead. The procedure handles this case, but the first call costs an error. |
| L6 | `convex/store.ts:195-223` | Frame history fails hard above 2,000 commits instead of paging. This is documented in the README, so I'm only noting it. |

## Checked, no finding
- **Fields and partial update:** `frameFields` has exactly the eight spec fields, all optional, and the validator rejects unknown keys. `{...before, ...fields}` changes only the given fields; an empty string stores `""`, as the README says. A blank reason and empty `fields` are rejected.
- **Atomic commit:** the `frame` commit (reason, full before/after, adventure id) and the adventure patch happen in one mutation (`store.ts:61-72`).
- **`get frame`:** reads through `by_campaign_and_adventure` in creation order. Seed and debrief commits never set `adventure`, so they can't leak into a frame's history.
- **`get overview`:** `frame` is the current adventure's frame, and `lastTime` now comes from the new `by_campaign_and_kind` index.
- **Scoping:** `campaignFor` plus `currentAdventureFor` (which checks `adventure.campaign === campaign._id`) keep every frame to its owner. `:961` tests a second owner and a new adventure starting with an empty frame.
- **Separation from story state:** entities, `find`, sessions and schema are deep-equal before and after, in the endpoint test and the SDK script. `frameUpdate` writes only `commits` and `adventures`.
- **Procedure:** covers everything spec #11 asks of the frame talk (stories 34–42), the "situations not outcomes" rule, `adventure_start` only on the game master's answer, corrections routed to `story_commit`, and the standing rules (tested at `:250`). The `frame_update` description repeats the rule, as the spec requires.

**Bottom line:** the code needs no changes to merge. Before linking AC 3, re-run the headless proof cleanly and isolated (B1), and re-run the SDK e2e against the final deploy (M1).
