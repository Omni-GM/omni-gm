# Review: Omni-GM/omni-gm #14, frame talk (`/home/coder/dev/omni-gm-frame-talk`, tracked and untracked diff against `origin/main`)

**Verdict:** I found no blocking defect in the code. The ticket is not ready to merge yet, because the third acceptance criterion (the headless frame talk) is not proven: the only transcript on disk failed its own readback. The worker was still re-running the proof while I reviewed, so the claims about proof files reflect the disk at 12:39–12:40 UTC.

**Gate, run read-only by me:** `vitest run` passed 25 of 25. Both `tsc --noEmit` runs (the `convex/` project and the root project) were clean. `biome check` reported one info, in an existing test at line 768, and no errors. I did not run codegen or any deploy. `git status` was the same after my runs.

## Acceptance criteria

| AC | Status | Evidence |
|---|---|---|
| 1. Endpoint tests: only the given fields change, a frame commit with its reason appears in the history, story state untouched | ✅ Met | `tests/mcp.test.ts:885–946`, `:948–1005`, `:1007–1032`, `:1034–1052`. Red logs `01`–`04` fail for the right reasons; `check.log` and `green-endpoint.log` are green. |
| 2. SDK e2e on the e2e deployment, linked | ✅ Met (see note) | `scripts/frame-e2e.ts` and `proof/frame-talk/sdk-e2e.log` (4 PASS lines). It ran on its own preview deployment, `nautical-crocodile-659`. |
| 3. Headless frame talk on the fixture, linked | ❌ Not proven | `claude-readback.log` holds an `AssertionError` at `verify-frame-talk.ts:104`. The transcript also shows the run was not isolated (P1 below). |

Note on AC 2: the spec calls for the e2e deployment in a separate `omni-gm-e2e` Convex project. The proof uses per-branch preview deployments in the `omni-gm` project, as #13 did and as the brief directs. That is not live data, so it is acceptable, but the spec text and the practice disagree.

## Findings

### P1: the headless run is not isolated, and its transcript breaks a standing rule
- **Where:** `proof/frame-talk/claude.jsonl`
- **Repro:**
  - The transcript contains a user turn `"Stop hook feedback: [node …/plugins/cache/claude-plugins-official/convex/1.14.0/hooks/convex-typecheck.mjs] … No CONVEX_DEPLOYMENT set"`.
  - The model then spends a turn on uncommitted worktree files and on whether to run `npx convex dev`.
  - Every assistant text is German, although the fixture prompt (`fixtures/frame-talk-answers.md`) is English.
- **Why it matters:**
  - The standing rule "Write in the game master's language" is broken in the proof transcript.
  - The run picked up the operator's global plugins and hooks, and likely their CLAUDE.md and language settings, from inside the repo worktree. The transcript therefore does not show what a game master's client does with only the server's procedure.
- **Fix:**
  - Run headless from an empty temp directory outside the repo, with isolated settings: a separate `CLAUDE_CONFIG_DIR` or `--setting-sources` with none, and `--strict-mcp-config --mcp-config <omni-gm only>`.
  - Add verifier assertions: no `Stop hook feedback` user turns, and the reply language matches the prompt (or at least no non-fixture system-reminder content).

### P1: the AC3 proof bundle is missing or inconsistent
- **Where:** `proof/frame-talk/claude-readback.log`, `claude.jsonl`, `claude-seed.log`, `claude-story-before.json`
- **Repro:**
  - The readback failed against the first transcript. Line 104 required `get` with `ref: "overview"`, but the model called `get {refs:["overview","frame"]}`. The script has since been patched to accept `refs`.
  - `claude-seed.log` and `claude-story-before.json` were written at 12:39:26–29, after `claude.jsonl` (12:38:54). The seed shows a new proof session (`k578…`), and the transcript wrote to adventure `j573…`.
  - So the "before" snapshot on disk does not belong to the transcript on disk.
- **Fix:** re-run seed, then `--before`, then the isolated headless run, then readback as one sequence. Commit only a set whose readback prints `HEADLESS FRAME TALK PROOF PASSED`.

### P3: the verifier misses entity reads made through `refs`
- **Where:** `scripts/verify-frame-talk.ts:120–125`
- **What:** `String(c.input.ref).startsWith("entity:")` ignores `get {refs:[…"entity:…"]}`. The overview and frame checks were fixed for `refs`; this one was not.
- **Repro:** a run that reads entities only as a batch fails the proof, although it did what the procedure asks.

### P3: the proof prompt coaches the behaviour the verifier asserts
- **Where:** `fixtures/frame-talk-answers.md`
- **What:** "Read the named story-state entities you need before you write" and "Follow the server's procedure" steer the model into the entity reads that the verifier then asserts.
- **Suggestion:** say so in the PR, or drop the entity sentence so that the skill alone drives it.

### P3: "an empty string clears a field" is documented but not tested
- **Where:** `convex/store.ts:62`, `README.md`, `convex/tools.ts` (input description)
- **What:** `{...before, ...fields}` stores `goal: ""`. It does not remove the key, so `get frame` and the overview then return `goal: ""`.
- **Suggestion:** either delete keys that are empty after `trim()`, or document that a cleared field is stored as `""`, and add one assertion either way.

### P3: whitespace-only values and no-op edits are accepted
- **Where:** `convex/store.ts:50–74`
- **What:** `fields: {goal: "   "}` passes. An update whose values equal the current ones appends a commit with identical before and after, which adds noise to the history.
- **Suggestion:** reject no-op updates and trim values. This is optional and not required by the spec.

### P3: frame commits can push older commits out of the overview's commit list
- **Where:** `convex/store.ts:238–243`
- **What:** the overview's `commits` list still uses `take(200)` across all kinds. 200 frame edits push every debrief and seed commit out of it.
- **Context:** `lastTime` is now safe, because it uses the new `by_campaign_and_kind` index, and the test at `:1034` covers that. Only the commit list is affected.

### P3: `get frame` errors before the first adventure exists
- **Where:** `convex/skills.ts` (frame-talk procedure); `convex/store.ts:195` (`get frame`)
- **What:** the procedure opens with "get overview, get frame". `get frame` throws "Call adventure_start first" when no adventure exists, while `get overview` returns `frame: null`. The procedure does cover the case without an adventure, so the model recovers, but at the cost of one error.

### P3: the skill list order changed
- **Where:** `convex/skills.ts:10`
- **What:** `frame-talk` is now listed before `map-speakers`, `split-scenes` and `debrief`. Workflow order, as the spec lists them, would put it last. Cosmetic.

## Checks that passed (no finding)
- **Partial edits:** only the given fields change; omitted fields are preserved (`:885`, and the SDK e2e). Unknown fields such as `outcome` are rejected by the validator. A blank reason and empty `fields` are rejected.
- **Atomic history:** the `frame` commit (with reason and before/after) and the frame patch on the adventure are written in one mutation (`store.ts:63–71`). History is read in creation order through `by_campaign_and_adventure`. Debrief and seed commits never set `adventure`, so they cannot leak into a frame's history.
- **Owner and adventure isolation:** `campaignFor` scopes every read and write to the caller. `currentAdventureFor` checks that the adventure belongs to the caller's campaign. Separate owners and a new adventure starting with a fresh frame are both tested (`:948`).
- **Story state unchanged:** entities, `find`, sessions and schema are deep-equal before and after, in the endpoint tests, the SDK e2e and the headless readback.
- **Overview:** `lastTime` no longer depends on frame commits (red log `04` reproduces the failure with 201 frame edits). `overview.frame` matches `get frame`.
- **Procedure:** it covers every spec point: one grounded question at a time with its reason, no outcome questions, the goal/stakes/timeframe stopping rule, asking only about fields put in question, keeping the game master's words, frame intent kept apart from story corrections, and `adventure_start` only on the game master's answer. The skill loads from loose names, and the `frame_update` description repeats the rule.
- **Secrets and data:**
  - No tokens or keys appear in the proof logs. Only preview deployment URLs appear, which matches #13's proof.
  - The fixture and the proof data are invented.
  - No auth or secrets code changed.

## Limitations
- The worktree changed during my review: `verify-frame-talk.ts` and the `claude-*` proof files were rewritten while I read them. My findings reflect the disk state at about 12:40 UTC; re-check AC3 against the final bundle.
- I did not run the deployed SDK e2e or the headless run myself (no deploys, no codegen, by brief). I judged them from their logs and transcript.
- I did not read the prototype branches or the GLOSSARY and ADR files beyond their frame-related entries.
- I did not open the full raw 15 KB transcript; I parsed tool calls, results and texts with a script. I did not inspect `~/.config/omni-gm/secrets.env`.
