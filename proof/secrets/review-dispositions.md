# Opus review dispositions

An initial read-only review and a fixes check ran with `claude -p --model claude-opus-5-5`, user
settings for provider auth, hooks disabled, an empty strict MCP config, and
only Read, Glob and Grep tools. The oracle was ticket #39 and spec #35.
`opus-review.md` and `opus-fix-review.md` are their unedited responses. The initial reviewer found no spec
violations and identified these optional edges and proof improvements.

1. **Closed-secret transitions: rejected.** The spec says the game master
   may change or drop a secret at any time and defines no terminal-state
   restrictions. Dropping a fixed secret changes the background record;
   deleting the established fact would violate separation from story state.
   The old fix stays in secret history. Only an explicit story correction
   changes entities. The count tracks open statuses, so closed transitions
   do not decrement it again. No transition restrictions were added.
2. **Near-limit secrets could not be fixed: fixed.** A fix may now use a
   compact game-master declaration as source with the full secret ref in
   the story change's `why`, or the existing exact-text quote path. It still
   requires an owner-scoped `story` commit and `game_master` basis. The new
   endpoint test fails before this change and passes afterwards for a
   near-16-KB secret, with a compact representation of the same fact in
   story state. `05-red-long-fix.log` and `05-green-long-fix.log` record it.
3. **Earlier/reused fix commits: rejected.** The spec does not impose a
   chronology or one-use restriction on fix commits. A game master may
   reaffirm already established background or fix two duplicate background
   records from the same sourced fact. Exact-text quotes or an explicit ref
   in the reasoned change bind the declaration to the secret. Requiring
   another no-op story commit would add history without changing truth.
4. **Unbounded secret ref: fixed.** Secret and story-commit refs are both
   capped at 200 UTF-8 bytes before lookup. `06-red-ref-bounds.log` and
   `06-green-ref-bounds.log` prove rejection without writing.
5. **Owner-scoped links not asserted by headless readback: fixed.** The
   independent SDK verifier now requires non-empty `about` and reads every
   linked `entity:<id>` under the same owner, checking its id. `readback.log`
   records all three successful reads.
6. **Rejected-run wording: clarified.** The proof index explicitly says the
   rejected log stops at the unsupported-fear assertion. The later full-ref
   assertion would also reject the abbreviated ref; the final run passes
   both. The first run had 594 words, within the limit.
7. **Existing Biome info: rejected as unrelated.** The `useTemplate` notice
   is in unchanged `tests/mcp.test.ts`; it is informational, and the gate
   exits successfully. It does not block the ticket and no unrelated edit
   was made.

CodeRabbit skipped its review because the PR remains a draft. The required
cross-family Opus review ran successfully and was not skipped.

## Fixes check

The follow-up review confirmed both code fixes and all rejected findings.
It found one medium proof-only issue while the final backend deployment and
readback were still running: the old hosted log lacked the new link check.
This is fixed by rerunning the strengthened verifier against the updated
preview. The final `readback.log` now prints `PASS all 3 about links read
back as owner-scoped entities` and the final pass banner.
`preview-deploy.log` identifies final source `a9e2269`; the initial headless
preview deploy is retained as `preview-initial-deploy.log`. No assertion was
removed, and no code changed after the fixes check.

## Checklist and stored-briefing integration

`opus-checklist-integration-review.md` reviewed the #38 reconciliation.
Both low findings were fixed:

- The verifier now checks a model `get checklist` after `checklist_set`,
  zero additional section questions, and the exact stored reason, alongside
  its existing exact-section/template assertions. The final readback passes.
- The section walk now separates factual-line citations from pitch sources.
  A fact may cite a full secret ref; a pitch still needs named story-state
  facts and may also cite relevant open secrets. This agrees with the
  standing rule instead of allowing a pitch built only on a secret.

#40 then merged. The briefing now preserves the stored text and adds only
relevant secrets written/changed since its debrief. A new owner-scoped,
bounded `writtenSinceDebrief` list accompanies each secret page, with
endpoint red/green for old, new and edited secrets. The fresh headless run
preserves every stored line, adds the literal marked secret, and passes
at 595 words. The current-main populated-store upgrade passes too. The
full local gate passes 93 tests. Earlier source/deployment references above
are historical; final artifacts are those currently in the proof bundle.

## Final whole-increment review

`opus-final-integration-review.md` found no product defects after #40.
Its one low proof finding is fixed. The verifier now requires the exact
stored body and What next text, with only one Since the debrief heading
and one literal secret line between them. It no longer applies the new-
briefing word budget to a stored briefing. The strengthened hosted readback
passes with 595 words; the full gate passes 93 tests.

The debrief commit is the shared cutoff for corrections and new secrets.
The reviewer noted that writes from another client between briefing-save
and debrief-commit share #40's cutoff gap. No change is needed for this
increment; concurrent debrief behavior remains the existing contract.
