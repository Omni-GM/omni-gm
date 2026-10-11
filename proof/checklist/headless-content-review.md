# Headless content review

Reviewed the final eight-turn `claude.jsonl` against ticket #38 and the
checklist/section-walk clauses of spec #35.

- Turn 1 loads `prep-sparring`, reads the missing checklist and asks once for
  the ordered sections, definitions and template. The client has no file or
  shell tools.
- Turn 2 copies the supplied definitions without changing case, stores the
  template and reason, and reads the saved checklist in a batch before
  opening Launch. It offers exactly two situations, each naming the facts
  it is built on. Neither decides an outcome or blocks the party's cellar
  search and weir watch.
- Turn 3 keeps only the second Launch pitch. It shows the note entry and
  offers Discoveries next, with the option to rework or stop.
- Turn 4 gives ten short numbered clues, as the stored Discoveries
  definition asks, with timestamps or stored entities as sources. They are
  proposed learnable details, varied across the latch, letter, millrace, key,
  debt, Sister Ulla, old miller, barges, river marks and town charter. They
  are not committed story-state claims.
- Turn 5 keeps only items 1, 3 and 5 and offers Supplies next. The debt
  remains identified as Dace's claim in story state; the picked clue is prep
  intent, and no story-state write occurs.
- Turn 6 takes the river map and two apprentice tokens the game master
  supplied. The mechanical section offers no pitches. Since it is the last
  section, the client also assembles the note.
- Turn 7 shows the note again in the template's heading order. It contains
  the chosen Launch, three chosen Discoveries, and the supplied props. The
  unpicked Launch and seven unpicked clues leave no trace in the note.
- Turn 8 is a new conversation without the earlier inputs. It loads the
  procedure, reads the stored checklist and uses Launch's exact two-pitch
  definition. It never asks the game master to supply the checklist or
  template again and never writes another version.

The deterministic SDK verifier separately checks the stored definitions,
template and reason, one initial history record and unchanged earlier
story state, frame, schema and sessions. Persistent note entries and resume
progress are outside this ticket.
