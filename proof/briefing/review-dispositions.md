# Review dispositions

Every finding from `codex-review.md` was checked against the code and the
conversation. All five hold; all five are fixed in `159b5ad`.

1. **Plank answers vs. "never story state".** Holds: the section walk said
   decided background is never story state, then allowed a plank answer
   through `story_commit`, as `plank-questions` still instructs. Fixed by
   scoping the rule to background decided in a pick and deferring plank
   answers to `plank-questions`. Turning plank answers into secrets is #39.
2. **Fixture moved the weir watch to tonight.** Holds: the seeded last-time
   text said "tonight", the transcript says tomorrow night. Fixed in
   `scripts/briefing-e2e.ts`; the fourth run's briefing says "tomorrow
   night".
3. **Unmarked NPC claim about the gate feud.** Holds: the third run stated
   Holloway's words about the widow as fact. The briefing procedure now says
   a line an NPC speaks is that NPC's claim, also about another NPC or a tie;
   the verifier checks the gate-feud line. The fourth run marks it
   "according to Holloway".
4. **Five-fact check ignored unsourced facts.** Holds. The verifier now
   counts every list item before the pitches in both sections and requires
   each to be sourced.
5. **NPC wants missing without a flag.** Holds: Corwin and Sister Ulla had no
   want and no flag. The briefing procedure now writes "wants unknown"; the
   verifier requires every NPC line to name or flag a want. The fourth run
   flags both.

The stricter verifier rejects the third run (kept as
`rejected-attempt-3.jsonl`); the fourth run passes it. The full gate is
green on the tree merged with main.
