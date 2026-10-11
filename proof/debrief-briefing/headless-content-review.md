# Headless content review

A read of `debrief.jsonl` and `prep.jsonl` against ticket #40, for what the
verifier cannot judge.

- The debrief drafted what the ticket asks without being prompted: a
  "Spring tide" clock at 0/4, shown, that pressures the courier and pay-chest
  threads; Hedda's and Osric's marriage in both NPCs' `relationships`; and
  Hedda's bell-for-ledger condition in the thread's `whatIsOpen` on
  `npc_said`.
- The review opens with one line, then the stored briefing word for word,
  two questions and three options. Both questions carry a timestamp. The
  first asks Brother Fen's concept and goal in one sentence: one question
  mark, two asks. The second asks where the garrison sits, a place rather
  than one of the five gap kinds the ticket names. Both stay within "at most
  five timestamped questions"; neither asks what the players will decide.
- The answers fixture was written before the run. The model used the
  answers that matched its questions or the store (Fen's presence, the tide
  clock, the marriage, the condition) and left the garrison as the table left
  it. Four answer changes carry basis `game_master` with the game master's
  words; the answer turn names no change one by one.
- After the commit, the client confirms in a short list before pointing to
  the stored briefing. That is the commit confirmation, not the review, and
  the ticket does not limit it.
- The prep loads `briefing`, then `prep-sparring` for the options that
  follow, reads only `get overview`, prints the stored briefing as plain
  text, inserts "Since the debrief" with the Gull Point correction before
  What next, and ends with the options and one call to pick.
