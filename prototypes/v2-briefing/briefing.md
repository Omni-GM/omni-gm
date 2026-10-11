# Briefing procedure (draft)

Use this to open prep. The briefing is one page that answers "where are we, and what pulls?" before the game master says anything. It gives before it asks.

## Read

1. `get overview` for `lastTime`, the current adventure, and its frame.
2. `find` without a query for every entity. Follow `nextCursor` until `totalIsExact`. Never brief from a partial page.
3. `get entity:<id>` (up to 25 refs per call) for threads, NPCs, clocks, character goals, and places. Keep each change's basis and source quote with timestamp.
4. Read the secrets the game master recorded, if the store holds any.
5. Optional, one pass only: `find` over the latest transcript for something a player raised and cared about that the story state left out. Use it to source a forgotten thread, never to redo the debrief.

## Write

Write in the game master's language. One page: 400 to 600 words. Plot first, no mechanics. Use these parts in this order, with short headings:

1. **Where the party stands.** Two or three lines: place, time, the last thing that happened, the plan the players announced.
2. **What pulls.** Three to five threads, strongest pull first. One or two lines each: where it stands, and what pulls the party toward it now. A thread that serves the frame's goal ranks higher.
3. **Forgotten?** One to three threads the players cared about that nothing moved. One line each, with why it might matter now.
4. **NPCs in play.** The three to six NPCs the next session is likely to meet. One line each: how they were played, what they want. If `playedAs` is empty, say "not played yet".
5. **Clocks and pressure.** Every clock with its value, measured against the frame's timeframe. Name a deadline the table mentioned that has no clock.
6. **Off-screen moves.** Two or three pitches the game master can pick from. Each names who acts, what they do while the party is busy, and the situation that lands on the table. Build each on named facts with sources. Never script the outcome or what the players do.
7. **Frame flags.** Only the frame fields the last session put in question, one line each. If the frame is empty, say so in one line and offer the frame talk. Leave this part out when nothing needs it.

End with one line that hands over to the game master's checklist, naming its first section. Ask no other question.

## Rules

- Every fact carries a short source: `[HH:MM:SS]` for the latest session, `[S<n> HH:MM:SS]` for an older one, or the entity name when the fact has no quote.
- Mark claims by who made them: "according to <NPC>", "rumor", "player guess", "player plan". Narration and the game master's answers stand bare.
- Mark a secret as a secret. Never write it as something the players know.
- Never invent a fact, a motive, or a clock. A gap is a flag, not a filler.
- Prefer the game master's and NPCs' own words for flavor, short and quoted.
- No tables. Plain chat text that reads well in every client.

## Example (invented)

> **Where the party stands.** Night in the salt port of Vell, in the back room of the Gull. Tomorrow at dawn the harbor master expects them [01:41:10]. The players plan the harbor master first, then the drowned chapel (player plan).
>
> **What pulls.**
> - *The harbor master's ledger*: according to the innkeeper it lists every ship the smugglers bribed [01:22:05]. The meeting is tomorrow.
> ...
>
> **Off-screen moves.**
> - *The smugglers clean house.* They know someone asked about the ledger [00:58:12]. The party arrives at dawn to find the harbor office already ransacked, and the harbor master missing.
> ...
>
> Next: your checklist, starting with *Characters*.
