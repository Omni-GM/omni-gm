# Headless content check

Reviewed the complete five-turn `claude.jsonl` against the recorded GM
inputs and the independently read-back story state. The extracted final
`session-note.md` excludes the assistant's closing explanation.

- Strong start has one bullet, exactly the GM's opening decision from turn 2.
- Places has four flat bullets. Amber Landing's conversation and Empty
  Loft's investigation are the GM's decisions from turn 3. The investigation
  remains a guess, with no invented player choice or outcome.
- Amber Landing's three mood details are verbatim narration in
  `fixtures/prep-session.txt` at 00:00:00. The shared citation covers all
  three details. Empty Loft has no supplied sensory descriptions and is
  marked missing; being open is not invented into a mood description.
- Main-plot background has one bullet, the exact GM answer from turn 4,
  with its game_master basis. Independent SDK readback confirms the exact
  source quote, one story commit, one appended history record on Mira and
  no other state change. The GM's reason is retained on that commit.
- The note has no unchosen clock values, NPC claims, rumor facts, extra
  scenes or invented descriptions. Each section is below five bullets,
  including nested bullets. The original four-turn note had six Places
  bullets when nested bullets were counted. Turn 5 is the GM's explicit
  formatting correction and the client preserves all decisions and sources.
- Three checklist questions were asked, one in each section, in order.
  Each asks about a situation, places/pressure or missing background and
  says why. The main-plot question loads plank-questions first. No question
  asks what the players will decide or how a scene ends.
- No assistant message offers a creative proposal. Facts and consistency
  checks precede the questions. The only write is the explicitly requested
  plank answer. Both procedures are loaded before it.
- The frame's question about why Mira protects the seal remains unanswered.
  The client states that gap without inventing a motive. The GM explicitly
  stops satisfied after recording what Mira wants. Skipping or stopping is
  allowed; this fixture does not claim to answer that additional question.

The initial Sonnet attempt is a separate failed run and has no bearing on
these success claims. The proof is one client run with corrections, not a
claim that model behavior is deterministic.
