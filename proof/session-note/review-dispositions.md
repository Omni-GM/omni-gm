# Opus review dispositions

The reviews are read-only Claude CLI runs using `claude-opus-5-5`, with only
Read, Glob and Grep available and no MCP servers. All use ticket #42 and
spec #35 as their oracle, reading the full diff against `origin/main`.

- Initial high finding, incomplete stop/resume proof: fixed. The fresh
  preview's five-turn conversation, independent stop readback, differing
  provider session assertion, final readback and finished markdown now pass.
- Initial medium finding, added numbering despite exact wording: fixed.
  The served procedure copies complete supplied entries verbatim including
  formatting. The original inputs and exact expectations passed on a fresh
  preview. The provisional numbered-list run remains explicitly rejected.
- New-script optional-chain warning: fixed. The only remaining Biome note
  is in an unchanged existing test.

[Final integration review](opus-review-final.md) finds no blocking defects
and confirms the initial findings are resolved. Its one low documentation
finding is fixed here: this paragraph describes the integration review,
rather than the superseded review under `pre-main-merge/`. The final coverage
limits are preserved in the root review: the populated upgrade fixture had
no reference session, the vault copy is a separate export request, one
successful model run does not measure reliability, and module-load order is
proven only by the gate and hosted deployments.

The first integration run is retained under `rejected-integration/`. It
saved, resumed and finished correctly but did not treat the ambiguous clue
fixture as hidden background. The final fixture explicitly identifies
unplayed decided background; the note wording and exact-entry assertion
remain unchanged, and the fresh rerun passes.

No findings were rejected. The first implementation circular-import error
and both verifier-authoring errors remain visible in the proof bundle.
CodeRabbit skipped the draft PR under its default draft-review policy;
the required other-family Opus review completed instead.
