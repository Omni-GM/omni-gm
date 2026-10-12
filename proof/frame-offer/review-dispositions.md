# Review dispositions

Codex GPT-6.1 Sol, high reasoning, read-only, as a T3 delegated task, on the
diff at `9717362`. No blocking findings. All three findings held and are fixed.

1. **Major: the verifier could pass a run that violates the ticket.** Held.
   The reviewer showed, on the real recording, that a mandatory first option
   and a briefing replaced by an announcement of the section walk both passed.
   The transcript checks moved to `scripts/frame-offer-transcript.ts`. They
   now compare the shown briefing with the stored body, require the first
   option to be a recommended short frame talk that is not mandatory, allow no
   other recommended option, and reject `prep-sparring` or a section heading
   before the frame is saved. `tests/verify-frame-offer.test.ts` keeps both
   refutations.
2. **Minor: "exactly as stored" contradicted the what-next change.** Held.
   The briefing now opens a stored briefing "exactly as stored, except for the
   What next change below", adds the frame talk as option 1 (recommended),
   drops the stored options' recommended mark and keeps every other stored
   line word for word ([red](02-red-stored-what-next.log),
   [green](02-green-stored-what-next.log)).
3. **Minor: the optional-topic guard read only the question sentence.** Held.
   A `**Finale.**` heading over a neutral question passed. The checks now
   also read the turn's headings, reject outcome questions, and require the
   three questions to cover goal, stakes and timeframe once each. The finale
   refutation is a test.

The headless proof ran again on the final tree merged with `main`; the first
run stays in `pre-review/`.

## Round 2

A second read-only GPT-6.1 Sol review checked the fixes on the merged tree.
It confirmed findings 2 and 3 fixed and found nothing blocking. Its new
findings, all about the transcript checks:

1. **Major: a mandatory offer still passed** ("You are required to finish it
   before choosing another option"). Held in part. The check now scans the
   whole What next part, not only option 1, for mandatory wording (required,
   must, have to, need to, cannot skip, before choosing). The suggestion to
   also require the word "skip" is rejected: the ticket's "the game master
   can skip it" is met by offering the other options as numbered choices,
   which the check requires, and the served procedure does not ask the client
   to say "skip". Requiring the word would fail a valid run.
2. **Major: a section walk announced under a plain "Strong start" heading
   before What next still passed.** Held. The text after the stored body must
   now start with the What next heading, and the section check recognizes a
   plain heading as well as Markdown and bold ones.
3. **Minor: valid questions could fail** ("about Holloway" in a stakes
   question, "their release" read as an optional topic). Held. A core heading
   (Goal, Stakes, Timeframe) now classifies the question; without one, the
   goal pattern needs "goal" or a closing "about?"; optional topics are
   matched as headings or as their full names in the question ("moments of
   release").

Red: [03-red-verifier.log](03-red-verifier.log). Green:
[03-green-verifier.log](03-green-verifier.log). Both recorded runs still pass
the stricter checks; `tests/verify-frame-offer.test.ts` runs them against the
current recording in the gate.
