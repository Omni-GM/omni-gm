# Opus review dispositions

The read-only native T3 review and literal `claude -p --model claude-opus-5-5`
review inspected the initial implementation. The final review covers the
combined tree after pagination and the completed proof.

## Native review

1. Search evidence: accepted. The endpoint and SDK now assert that a known
   two-keyword source and utterance precede a one-keyword match. Endpoint
   coverage also follows a source continuation and checks the basis on both
   pages. `07-red-paginated-basis.log` runs the final test with main's search
   implementation, which lacks structured basis. The unchanged final test
   passes with the basis addition. The earlier red/green logs were collected
   before formatting and later test additions; changed line numbers alone
   do not change an assertion. Ranking on the integrated tree is green-only
   here because #28 supplied it with its own proof.
2. Pagination overlap: accepted and resolved. Merged `origin/main` through
   #28 and #29, kept the complete paginated search/read and drop-refusal
   implementations, and added basis to the source hit validator and mapping.
   Ranking is within each page, as the API's order field says. Re-ran the
   gate, SDK proof and headless proof on the combined code.
3. Batch errors lack a change index: accepted. Errors now name the failed
   change with a one-based number and its rule/allowed values. Red/green
   endpoint proof checks the fourth change fails without retaining changes.
4. Empty source timestamp differs between writes: accepted. Timestamp
   validation now lives in the shared state validator. Both debrief_add and
   story_commit reject a supplied empty timestamp. The endpoint proof runs
   red then green for that behavior.
5. Missing comma in skill description: accepted and fixed.
6. Incomplete proof: accepted as an observation during implementation. The
   final committed bundle and ticket links supply the SDK, headless run,
   independent readback, gate and CI evidence. No incomplete run is claimed
   as successful proof.

The inherited bounded replay and relationship-read capacity remains the
existing v1 limit. A transaction that exceeds Convex limits rejects
atomically; this PR does not broaden that capacity.

## Literal CLI review

1. Branch behind main: accepted as an integration/proof gap, not a deletion
   in the eventual three-way merge. The initial review used a two-dot diff
   against moving main. Integrated both new main commits and retained all
   drop-refusal code, descriptions, tests and proof files. The final diff is
   against the updated main and all deployed proof uses the combined code.
2. Mixed-type rank inconsistency: resolved by retaining #28's complete
   search implementation. All types use its keyword-count score and declared
   type-then-page-relevance order. This PR changes only the source basis
   shape and mapping on that implementation. It adds no score formula.
3. Empty timestamps: fixed by the shared validation above.
4. Procedure-list typo: fixed.
5. Session-note ambiguity: accepted. The procedure explicitly excludes
   recalled facts the GM did not choose. The only additions to their
   decisions are sourced mood details. Content is checked against the
   recorded GM turns in the final headless proof.

The listed SDK/headless/linking gaps are closed by the final bundle. The
failed Sonnet attempt is retained separately and is not acceptance proof.
It changed the adventure and used the wrong language. The procedure now
front-loads reading the existing intent, forbids starting an adventure in
sparring, and follows the GM's explicitly requested language. The fresh
Opus proof and independent before/after comparison exercise these rules.
