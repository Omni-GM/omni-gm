# Review dispositions

Codex GPT-6.1 Sol, high reasoning, read-only, as a T3 delegated task, on the
whole diff against `main` with ticket #40 and spec #35 as the oracle. It
reported three findings. All three hold and are fixed.

1. **Must-fix: the verifier counted question items, not questions.** Holds.
   Item 1 of the first review asked why the party wants the courier and who
   sent them, so five items held eight questions. The `debrief` procedure now
   asks for one single question per item and never two in one item. The
   verifier counts question marks outside quotes, requires exactly one per
   question item with a timestamp, and at most five. It rejects the first run,
   kept as `rejected-attempt-1-*` with `rejected-attempt-1-recheck.log`.
2. **Must-fix: per-change detail before it was asked for.** Holds. The first
   run opened its review with two rejected links, and its answer turn listed
   the answer changes one by one before the revised briefing. The procedure
   now opens the review with the briefing and at most one line before it,
   never lists drafted or rejected changes or schema limits, and shows the
   review again in the same shape after answers. The verifier checks both
   review turns: at most one line before the briefing, the stored briefing
   line for line, questions as above, at most 300 words besides the briefing,
   and no change markers.
3. **Should-fix: `correctionsSince` kept the oldest 200 corrections.** Holds.
   Past 200 story commits since a debrief, the newest correction was the one
   left out. The overview now keeps the 200 newest, oldest first.
   `02-red-newest-corrections.log` shows the new endpoint test failing on the
   old query, and `02-green-newest-corrections.log` shows it passing. The
   bound stays, like the overview's other 200-item lists, rather than
   failing the overview or adding a continuation for a case no session
   reaches.
