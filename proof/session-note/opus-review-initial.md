I found no correctness problems in the server code. But the third acceptance criterion (a fresh run resumes and finishes the note) has no proof, so the ticket isn't ready to ship as claimed.

## Findings

**1. High: the headless stop/resume proof is red and only half done.** Files: `proof/session-note/`, `README.md:29-34`, `scripts/session-note-e2e.ts`

- `claude.jsonl` has only turns 1–3 (results at lines 21, 28 and 39), and `headless-run.log` reads "Completed headless turn 1 / 2".
- There are no turn 4 or 5 events, so no fresh resume run and no `op: finish` write were recorded.
- `session-note.md` and `finished-note.json` don't exist. `verifyConversation()` writes both, so the final verification never passed.
- `stopped-readback.log` ends with an `AssertionError` at `session-note-e2e.ts:273`, so even the stop checkpoint is red.
- Yet `README.md:34` says the "fresh-conversation stop/resume proof is in `proof/session-note/`".
- **Failure scenario:** a reviewer or the merge gate trusts the README and the SHIP bundle. "Second, fresh run resumes at the first open section and finishes the note in the invented template" ships unproven.
- **Fix:** rerun the full headless sequence (stop, fresh resume, finish), make `--stopped` and the default verify pass, and commit the generated artifacts. Until then, drop the README claim.

**2. Medium: the procedure turns the game master's exact wording into a numbered list, which is what makes the stop readback fail.** Files: `convex/skills.ts:136` ("a list section keeps its picked items"), `fixtures/note-stop.md`

- The game master said "Bitte genau diese zwei Hinweise festhalten: Am Fenster klebt rotes Wachs. Im Keller liegt ein nasser Handschuh."
- The agent saved `"1. Am Fenster klebt rotes Wachs.\n2. Im Keller liegt ein nasser Handschuh."` (`claude.jsonl:31`).
- The words survive but the format the game master asked for exactly does not. The later check `markdown.includes(picks[1])` at `session-note-e2e.ts:590` would fail the same way.
- **Fix:** pick one side and make the proof and procedure agree:
  - Either the procedure keeps the entry verbatim when the game master gives exact wording, and list formatting applies only to picks taken from pitches.
  - Or the fixture gives the two clues as two lines, and the assertion compares items rather than one string.
- Leaving it as is keeps the proof red.

## Checked and clean
- **Upserts:** they leave other sections and omitted fields alone. Unknown sections are rejected before any write (`notes.ts:97-98`). All validation runs before the single write, so a rejected call writes nothing.
- **Finished notes:** they're read-only. Reopening needs a non-blank reason and can't carry an edit in the same call. Finishing needs no open sections.
- **Stale writes:** a write must name the current session, so after a new debrief an old one is refused. Two writes to the same section in the same session simply overwrite each other, which fits the design.
- **Owner isolation:** the campaign comes from the signed-in caller. Another owner's session ID gets "Prep changed", and a spoofed `caller` argument is ignored. Both are tested.
- **Checklist snapshot:** the first write keeps the checklist and template with that prep; later `checklist_set` calls apply to the next prep. Section names must be unique (`checklists.ts:30`), so a section name can only ever match one entry.
- **Size bounds:** a stored checklist can be up to 32 KB, which leaves at least about 96 KB of the 128 KB note for entries. That's a documented trade-off, not a bug.
- **Schema deployment:** only adds things. A new `notes` table and index (`upgrade-deploy.log`), and `--after-upgrade` shows every existing read unchanged with `note` null.
- **Overview:** `prep` comes from the same `currentNote`, so it can't disagree with `get note`.
- **Local gate:** green, 99/99 tests (`check.log`), with one Biome warning in the new script (`session-note-e2e.ts:261`, optional chain).

## Coverage limits
- `store.ts` and `notes.ts` import each other. `01-circular-import-error.log` shows this broke once. The current code passes in vitest and deployed to the preview, but I couldn't verify load order in the Convex runtime beyond that.
- The script that produces `claude.jsonl` isn't in the diff. I can't confirm that turns 4–5, once recorded, would come from a really fresh conversation rather than a resumed one.
- I didn't review the procedure's resume and finish behaviour live. No artifact shows it.
