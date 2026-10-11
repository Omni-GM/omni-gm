# Briefing procedure (draft)

Use this to open prep. The briefing is one page that answers "where are we, and what pulls?" before the game master says anything. It gives before it asks.

## Read

1. `get overview` for `lastTime`, the current adventure, and its frame.
2. `find` without a query for every entity. Follow `nextCursor` until `totalIsExact`. Never brief from a partial page.
3. `get entity:<id>` (up to 25 refs per call) for threads, NPCs, clocks, character goals, and places. Keep each change's basis and source quote with timestamp.
4. Read the secrets the game master recorded, if the store holds any.
5. Optional, one pass only: `find` over the latest transcript for what the story state left out: a thread the players cared about, a deadline the table named, a tie between NPCs in play. Never redo the debrief.

## Write

Write in the game master's language. One page: 400 to 600 words, the What-next options included. Plot first, no mechanics. Use these parts in this order, with short headings:

1. **Where the party stands.** Two or three lines: place, time, the last thing that happened, the plan the players announced.
2. **What pulls.** Three to five threads, strongest pull first. One or two lines each: where it stands, and what pulls the party toward it now. A thread that serves the frame's goal ranks higher.
3. **Forgotten?** One to three threads the players cared about that nothing moved. One line each, with why it might matter now.
4. **NPCs in play.** The three to six NPCs the next session is likely to meet. One line each: how they were played, what they want, and their tie to another NPC in play (partner, rival, boss). If `playedAs` is empty, say "not played yet".
5. **Clocks and pressure.** Every clock with its value, measured against the frame's timeframe, then the pressure that has no clock.
6. **Off-screen moves.** Two or three pitches the game master can pick from. Each names who acts, what they do while the party is busy, and the situation that lands on the table. Build each on named facts with sources. Never script the outcome or what the players do.
7. **Store corrections.** Only when step 5 found something the story state lacks. One line each: the missing clock, tie, or thread, with its source. They wait for the game master's okay; then write them with `story_commit`, basis as found, so the store is right. At the debrief review they are draft changes instead. Leave this part out when nothing is missing.
8. **Frame flags.** Only the frame fields the last session put in question, one line each. If the frame is empty, say so in one line. Leave this part out when nothing needs it.
9. **What next?** Always end with two or three numbered options, the recommended one first, such as: confirm the corrections, then the first checklist section; a short frame talk when the frame is empty or flagged; pick an off-screen move and go straight to the strong start. Ask no other question.

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
> **What next?**
> 1. Confirm the corrections, then your checklist from *Characters* (recommended).
> 2. A short frame talk first: goal, stakes, timeframe.
> 3. Pick an off-screen move and go straight to the strong start.

## The briefing as the debrief's review

When the briefing closes a debrief, it carries at most five review questions, each with a transcript timestamp, aimed at what this briefing needs and the debrief could not settle alone:

- a deadline the table named that has no clock, and what happens when it runs out;
- a tie between two NPCs in play;
- a condition an NPC set on a thread;
- an NPC's role when the transcript leaves it unclear;
- a player character who stayed silent: were they there, and what do they know?

The answers fix the briefing and become story state with basis `game_master`; then the game master commits, and the same briefing opens the next prep.
