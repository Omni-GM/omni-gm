**Verdict:** The core is sound. `story_commit` is atomic and goes through the same rule check as the debrief commit. The tools match spec #11. I found no blocking code defect. The real risks are a test that would pass even if ranking were broken, the merge with #28, and proof that is not finished yet. I reviewed the diff `origin/main...5cf3b5d` in `/tmp/omnigm-impl15`, read-only.

## Findings

**1. Medium: the search ranking test passes even if relevance ranking is broken.** (`convex/search.ts:165-204`, `tests/prep.test.ts:314,340`)
- **Trigger:** any `find` for one keyword over sources or transcripts.
- **Mechanism:** the score is `1/(rank+1)` from each hit's position in the search index result, so the first hit scores 1 and the second 0.5 by construction. The assertion `hits[0].score > hits[1].score` therefore holds whatever order the index returns. The SDK e2e (`scripts/prep-e2e.ts:301-305`) only checks that scores never increase down the list, which is equally automatic.
- **Consequence:** the acceptance line "search ranks sources and utterances" has no test that would catch a wrong order. Separately, `04-red-search.log` points to `tests/prep.test.ts:136`, but that assertion now sits at about line 314. The red run came from an earlier version of the test, so the red-to-green pair is not for the same assertion.
- **Fix:** seed two sources where only one matches both words of a two-word query, or where one source is clearly more relevant. Assert that hit's `ref` comes first, not its score. Re-record the red run against the final test.

**2. Medium: this branch conflicts with open PR #28 (#21 pagination) in `convex/search.ts`.**
- #28 rewrites `find` completely:
  - it reads `history` and `utterances` through the `by_campaign` index, page by page, instead of the search indexes;
  - it scores each hit by how many query words it contains, and only ranks within a page (`order: "type_then_page_relevance"`);
  - it adds an `id` to each hit and adds `nextCursor`, `truncated` and `totalIsExact` to the result.
- **Consequences when the second PR lands:**
  - (a) The new `basis` field on hits disappears unless someone re-adds it to #28's `hit` validator and its source mapping.
  - (b) The rank-by-position code here no longer exists, so the README line "Source and utterance hits retain keyword relevance rank" (`README.md:~125`) becomes false.
  - (c) The test at `tests/prep.test.ts:314` fails, because both "amber" sources score 1.
- **Not affected:** the `story_commit` code. History rows with no session merge cleanly. #28's `get entity` history pagination reads the same rows, and #28's search maps sources via `entityIds[0]`, same as here.
- **Fix:** decide the merge order now. If #28 lands first, rebase this branch and carry `basis` into #28's `hit` shape. Then rewrite the rank test as a check within one page, and change the README to "ranked within each page".
- Both new skills already say to follow continuations (`convex/skills.ts:12,22`), which is forward-compatible with #28.

**3. Low–medium: a rejected `story_commit` does not say which change failed.** (`convex/debrief.ts:594-598`)
- **Trigger:** a batch of several changes where one is invalid, such as a guess-only NPC update or an unknown enum value.
- **Consequence:** the error contains the rule and the allowed values, but no index. `debrief_add` returns `{index, reason}`. The `plank-questions` skill asks the AI to "correct the batch", but with up to 500 changes the AI has to guess which one to fix.
- **Fix:** wrap `state.apply` in a try/catch, as `applyPendingChange` does, and re-throw `Change ${i}: ${reason}`. Add an assertion on that index to the existing rejected-batch test at line 86.

**4. Low: one source rule differs from the debrief path, against "the same rules as the debrief".**
- `storyCommit` validates `source.at` with `!== undefined` (`debrief.ts:592`). The debrief path's `validScene` uses a truthiness check (`debrief.ts:336`).
- **Trigger:** a source with `at: ""`. `story_commit` rejects it; `debrief_add` accepts it.
- **Fix:** move both paths onto one shared helper.

**5. Low: missing comma in the `skill` tool description.** (`convex/tools.ts:62`)
- It reads "split-scenes, debrief frame-talk, prep-sparring…".
- A model can read that as one procedure called "debrief frame-talk".

**6. Low: the README claims proof that is not committed.** (`README.md:~139-141`)
- It says `proof/prep-sparring/` holds "SDK run, headless conversation and independent readback".
- See the proof assessment below for what is actually there.

**Inherited limit, not a defect of this PR:** `story_commit` reuses `stateFor` and `persist`. For every `relate`/`unrelate`, `persist` reads up to 2,001 relationship rows. A batch of 500 relationship changes could hit Convex's per-mutation read limit, the same as a large debrief commit. You could cap relationship operations per batch, or look up by both endpoints.

### Checked and fine

- **Atomicity:** every change is applied in memory before the first write. Any thrown error rolls back the whole mutation.
- **Same rules as the debrief:** kinds, properties, enums, relationship endpoints, the guess restriction, non-empty basis, sources and `why`, and `$tempKey` all run through the one `DraftState.apply`.
- **Story commits stay out of debrief state:** they carry no session or adventure. `get overview` therefore still takes `lastTime` from the latest debrief commit, and frame history still filters to `kind === "frame"`.
- **Schema changes:** `history.session` and `history.scene` are now optional, with no other reader that assumes a string.
- **Owner scoping:** goes through `campaignFor(caller)`.
- **Skills:** both procedures forbid drafting prep or proposing unasked, and allow at most three proposals and only on request. The prep-sparring skill tells the AI to use the game master's own template, keep their wording, add only sourced mood details, and mark missing ones rather than invent them. The plank-questions skill records the game master's exact words with basis `game_master`.

## Proof gaps (unfinished proof, not code defects)

1. **The headless sparring run (acceptance criterion 3) has not been done.**
   - There is only a seed log, `claude-seed.log`, which is untracked, plus a deploy log.
   - There is no conversation transcript. Nothing shows the skill was loaded before writing, that the note holds only the given decisions plus sourced mood details, or that the AI proposed nothing unasked.
   - These are model-behaviour claims, and no endpoint test can cover them.
2. **The SDK e2e (criterion 2) passed but is neither committed nor linked.**
   - `sdk-e2e.log` shows PASS on `clean-whale-475` at commit 5cf3b5d.
   - It and `sdk-preview-deploy.log`, `claude-preview-deploy.log`, `claude-seed.log` and `sdk-repeat.log` are all untracked.
   - Commit them, link them in the PR, and record the commit SHA.
3. **The endpoint proof is partly there.**
   - Committed red/green pairs exist for the story commit, atomicity, bounds, search and skills.
   - The full gate log, `check.log`, shows 60 of 60 tests passing.
   - The search red log comes from an older version of the test, and the ranking assertion would pass even if ranking were broken (finding 1). Treat the ranking criterion as not yet proven.
4. **There is no independent readback.**
   - The README promises one, but no file contains a fresh `get`/`find` of the stored plank answer after the headless run.
5. **CI is not proven.**
   - `check.log` is a local run, and I saw no link to a CI run.
