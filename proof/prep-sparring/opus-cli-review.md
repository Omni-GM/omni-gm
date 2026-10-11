I found two real defects and three smaller ones. The `story_commit` core is sound: invalid input writes nothing, the rules match the debrief's, and other owners can't touch the data. But the branch is behind main and needs a rebase before it can be judged against `origin/main`, and two of the three acceptance criteria are still unmet.

## Defects

**1. The branch is behind `origin/main`, so the diff undoes the merged drop-refusal fix.**
- **Cause:** the branch head `5cf3b5d` sits on `67c7c30`, but `origin/main` has since moved to `9ddd09f`. That commit holds the drop-refusal work. Compared with `origin/main`, the patch:
  - deletes `ledgerRowsById`/`dependentName` from `convex/debrief.ts`;
  - brings back the old "Drop also requires invalid remaining changes" message (`debrief.ts:466-469`);
  - reverts the `debrief_drop` description (`tools.ts`), the debrief skill text (`skills.ts`) and the drop test (`tests/mcp.test.ts`, back to `.rejects.toThrow("c2")`);
  - deletes `proof/drop-refusal/*`.
- **Consequence:** a squash or 3-way merge will likely conflict at `README.md:58-60`. Main changed the drop lines right next to the line this branch rewrote ("Later corrections use `story_commit`"). The gate in `check.log` and the SDK proof (deployed from `SOURCE COMMIT 5cf3b5d`) ran without main's code, so they don't prove the merged result.
- **Fix:** rebase onto `origin/main` and keep main's versions of the drop code, its message, the skill and tool text, the test and the proof files. Then rerun `pnpm check` and redeploy for the SDK and headless proofs from the rebased head.

**2. Mixed-type `find` now buries the second-best sources and utterances under every matching scene.**
- **Cause:** `search.ts:173-204` now scores sources and utterances by rank (`1/(rank+1)`, entities already were). Scenes at `search.ts:134-146` still add a flat 1 per word.
- **Trigger:** `find {query:"seal"}` with no `types` and the default limit of 10, on a campaign with 9 or more scenes that mention "seal".
- **Consequence:** all those scenes score 1.0. Every source or utterance hit after the first scores 0.5 or less and falls off the page. Before this change, sources and utterances tied with scenes. So a prep lookup without a type filter loses the transcript and source detail it is looking for.
- **Fix:** score scene hits by rank too (iterate `.entries()` and pass `1/(rank+1)`, as the other branches do). Add an endpoint test with a mixed-type query.

**3. An empty timestamp is accepted by `debrief_add` but rejected by `story_commit`.** The ticket asks for the same rules.
- `debrief.ts:336` checks `if (source.at)`, so `at: ""` is skipped. `debrief.ts:594-595` checks `source.at !== undefined`, so `seconds("")` throws "Invalid timestamp".
- **Trigger:** an AI sends a plank answer as `sources:[{quote, at:""}]`.
- **Consequence:** the whole batch is rejected for a value the debrief accepts.
- **Fix:** move the source-timestamp check into one helper, called from `validScene` and from `storyCommit`, with a single rule for empty strings.

**4. A missing comma in the `skill` tool description (`tools.ts:62`).** It reads "debrief frame-talk", so the model sees one name where there are two procedures. Fix: "debrief, frame-talk".

**5. The prep-sparring note rule contradicts itself and works against the headless criterion (`skills.ts:18`).** It says "Use only their given decisions …" and then "Cite every recalled fact". Read together, the AI may put cited story-state facts (for example "Ferry bell 1/4") into the note. The criterion requires that the note "holds only the given decisions plus sourced mood details". Fix: limit citations to the sparring talk, and say that the note adds nothing beyond the decisions and the sourced mood details.

## Proof gaps (not code defects)

- **README claims proof that doesn't exist.** `README.md:140-141` says `proof/prep-sparring/` holds the "headless conversation and independent readback". Neither exists yet: there is only `claude-seed.log`, no `claude.jsonl`, and no readback script like `scripts/verify-frame-talk.ts`. Either add them or don't merge the README claim.
- **The ranking tests only prove the scoring formula.** `tests/prep.test.ts` (`hits[0].score > hits[1].score`) shows the reciprocal-rank math works. It doesn't show that the better keyword match ranks first. That's acceptable as a contract test, but nothing checks the order across types (see defect 2).
- **The SDK log comes from the stale commit.** `sdk-e2e.log` and `sdk-repeat.log` were run on `5cf3b5d`. They need to be regenerated after the rebase.

## Acceptance criteria not met on the current tree

1. **Endpoint tests:** written and green, but only on a stale base. Mixed-type search ranking is untested, and the gate has to be rerun after the rebase.
2. **SDK e2e linked:** the run passed, but from pre-rebase code and not yet linked from the ticket. Rerun it after the rebase.
3. **Headless sparring run:** not done. Only the fixture seed exists. Still missing:
   - a conversation with an invented template and invented decisions;
   - proof the run loaded `prep-sparring`;
   - a note holding only the decisions plus sourced mood details, with the Empty Loft marked as having none;
   - one plank answer stored with basis `game_master`;
   - nothing proposed unasked;
   - an independent readback.
