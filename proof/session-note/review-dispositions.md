# Opus review dispositions

The reviews are read-only Claude CLI runs using `claude-opus-5-5`, with only
Read, Glob and Grep available and no MCP servers. Both use ticket #42 and
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

[Final review](opus-review-final.md) confirms both findings resolved and no
remaining actionable problems. It accepts the documented latest-only
reopen reason. Its coverage limits are retained verbatim: one successful
model run, the separate direct vault export rather than a vault write during
prep, and no independent investigation of module-load order beyond the
passing endpoint tests and hosted deployments.

No findings were rejected. The first implementation circular-import error
and both verifier-authoring errors remain visible in the proof bundle.
CodeRabbit skipped the draft PR under its default draft-review policy;
the required other-family Opus review completed instead.
