# Review dispositions

Read-only `claude -p --model claude-opus-5-5`, with only Read, Glob and Grep,
reviewed the whole diff against main `94d9e81`, implementation head `9a8d6eb`,
ticket #38 and spec #35. The full response is `opus-review.md`. It found no
must-fix findings and confirmed all three acceptance criteria. Every optional
finding was checked against the code and transcript.

1. **Unneeded history on walk start: fixed.** The served walk now requests
   `get checklist` with `limit: 1` for setup, confirmation and a later client.
   This leaves the full current checklist available and avoids sending up to
   ten old versions. The fresh-client turn was rerun on the updated preview;
   the verifier requires its checklist reads to carry that limit.
2. **Note-save wording: rejected for this ticket's scope.** The transcript
   explicitly says picks live only in the shown note, and readback proves no
   story-state or note write occurred. Durable note entries and cross-client
   resume are the session-note ticket's responsibility. Adding a note API here
   would duplicate that separate implementation. The limitation is named in
   the proof README and PR description; no persistence claim is made.
3. **Procedure-wording test: fixed.** Removed the new wording test as spec #35
   requires. Its historical red/green artifacts are preserved and identified
   as superseded; the actual behavior is proven headlessly. Existing tests
   from other tickets are unchanged.
4. **Weak section-order verifier: fixed.** The verifier now records each
   section's first actual heading across turns 2 through 6 and requires
   Launch at turn 2, Discoveries at turn 4 and Supplies at turn 6 in that
   order. Mentions in narrative text no longer pass that check.

CodeRabbit skipped the draft PR. No other bot finding or review thread is
outstanding. The main refresh, final local gate, refreshed headless readback
and PR CI are checked before merging.
