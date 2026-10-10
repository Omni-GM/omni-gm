# Story-state changes: format and fields

A debrief is a list of changes to the story state, grouped by scene. This file defines one change and the fields each story-state kind may carry. The AI fills only fields the session gives evidence for and never invents a field that is not listed here.

## One change

```markdown
- **NEW npc** Brannoc Wheelwright
  - role: cartwright at the river ford
  - played as: slow, gravelly voice; answers every question with a question; distrusts magic
  - wants: his stolen mule back
  - last seen: his workshop at the ford, end of scene 2
  - basis: narrated
  - line: [0:42:13] GM: "He squints at you. 'And who's asking?'"
  - why: improvised this session, not in the prep
```

- **Operation:** `NEW`, `UPDATE` (only the fields that changed), or `CLOSE` (a thread resolved, an NPC dead or gone, a clock run out).
- **Kind:** one of the kinds below.
- **Name:** the name as it was spoken at the table. Note other spellings heard in the transcript.
- **Fields:** only the ones listed for the kind, and only when the session shows them.
- **basis:** where the change comes from. One or more of:
  - `narrated`: the game master stated it as narrator or as a ruling, or it happened in play.
  - `said by <NPC>`: an NPC told the party. The game master decides whether it is true.
  - `rumor`: introduced at the table as a rumor.
  - `player guess`: a player's theory that the game master did not confirm.
  - `player plan`: what the players intend to do.
  - `game master`: the game master's answer or correction during review.
- **line:** at least one timestamp with a short verbatim quote from the transcript, or the game master's answer for `basis: game master`. A change without a line is not allowed.
- **why:** one short sentence on why this changes the story state.

## Fields per kind

| Kind | Fields |
| --- | --- |
| `npc` | role, played as, wants, knows, relationships, last seen, status |
| `place` | what it is, details shown, who is there, state |
| `world fact` | statement |
| `thread` | what is open, raised by, status (`open`, `advanced`, `closed`), next step, deadline |
| `character goal` | character, goal, what changed |
| `clock` | counts toward, value, change, visible to players |

A `clock` is a story clock: a deadline or a threat in the world. Rest limits and other mechanics are not clocks.

**played as** is required for every NPC the game master voiced, and empty for NPCs who were only named. It is the most important field for an NPC: voice, manner, speech habits, and attitude toward the party, as the game master actually played them. It is what lets the game master play the NPC the same way next time.

**Facts and guesses stay apart.** A `player guess` or `player plan` never updates an NPC, place, world fact, or clock. It may only open or advance a `thread` or update a `character goal`.
