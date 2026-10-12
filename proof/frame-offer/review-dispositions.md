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
