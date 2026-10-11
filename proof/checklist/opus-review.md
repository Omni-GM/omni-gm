I found **no must-fix findings.** The required acceptance proof holds, and nothing I found blocks merge on the review criterion.

## Must-fix

None.

## Checked and found sound

- **API contract:** `convex/checklists.ts:20-37` checks everything before it touches the database, and a thrown `ConvexError` rolls back the whole mutation. The red logs fail for the intended reasons: the 01 read was rejected as an unknown ref, 03/04/05 resolved where they should have rejected, and the 02 history came back as `[]`.
- **Owner isolation:** writes go through `campaignFor` using the gateway's identity. A spoofed `caller` is overwritten (`tests/checklist.test.ts:216-228`). The cursor scope is `JSON.stringify([campaign._id, ref])` (`convex/store.ts:204`), so a borrowed cursor fails `position()`.
- **Pagination and limits:** history is capped at `Math.min(limit, 10)` and `maximumBytesRead: 500_000`. Each commit document is at most about 64 KB (before plus after), well under the document limit.
- **Additive deploy:** the change adds a table, an optional `checklistChange`, and a new `kind` literal. No reader branches exhaustively on `kind`. The frame history reads commits by adventure, and checklist commits have no adventure, so frame history ignores them. The before/after upgrade readback shows existing records unchanged.
- **Local gate:** `check.log` passes 83 tests in 6 files, with none skipped.

## Optional follow-ups

1. **History is sent on every walk start.**
   - Where: `convex/store.ts:205-225`, together with `convex/skills.ts:38` ("Read get checklist first").
   - Example: a game master who replaced a 30 KB checklist ten times gets about 600 KB of history back whenever a client starts prep.
   - Impact: the client's context fills with old versions the walk never uses. Typical checklists are small, so this is rare.
   - Fix: have the procedure read `get checklist` with `limit: 1`, or let the walk read the current checklist without history.
2. **The client claims to save note entries it cannot store.**
   - Where: `claude.jsonl` turn 6 says "Saved as your Supplies entry" and "live only in this note", but no note tool exists yet.
   - Impact: in a client without a vault, the game master may think the picks will still be there in a later session. The cause is the existing "record … as this section's note entry" wording in `convex/skills.ts:42`, not this diff.
   - Fix: hand this to the session-note ticket, or until then say "show back" instead of "record".
3. **One test checks procedure wording.**
   - Where: `tests/checklist.test.ts:245-257` checks the procedure text, which spec #35 says not to do ("No tests of procedure wording").
   - Context: `tests/prep.test.ts:393-402` already does the same, and the headless run proves the actual behaviour.
   - Fix: drop the test, or keep it and note the existing precedent.
4. **The verifier's section-order check is weak.**
   - Where: `scripts/checklist-e2e.ts:184-189`. It only checks that turn 2 has no `## Discoveries` heading, and that turns 4 and 6 mention their section names.
   - Context: the transcript itself shows Launch, then Discoveries, then Supplies, and `headless-content-review.md` confirms it, so the proof holds.
   - Fix: check where each section's heading first appears across the turns.

## Acceptance proof

- **AC1 (store, history, isolation):** holds. The endpoint tests cover setting, replacing (with `before: null` and then the prior version), pagination, and Bob being kept out of Alice's checklist (read, write, cursor, spoofed caller). The SDK runs confirm this on a staging preview.
- **AC2 (invalid input rejected without writing):** holds. Each case leaves both `get checklist` and `get overview` unchanged: no sections, more than 100 sections, blank name or definition or template or reason, duplicate names (ignoring surrounding whitespace and case), a missing field, and each 32 KB overflow (template, multibyte text, definition, reason).
- **AC3 (headless no-vault walk):** holds.
  - The client had only the MCP tools, no shell or files.
  - Turn 1 read the null checklist and asked once.
  - Turn 2 called `checklist_set` exactly once, with the supplied words exactly, and confirmed it in a batched `get`.
  - The walk followed the stored order:
    - Launch: two "Built on" situations.
    - Discoveries: ten short sourced clues.
    - Supplies: no pitches.
  - Turn 8, a new conversation, read the stored checklist, used Launch's two-pitch definition, and never asked for the checklist again.
  - `headless-checklist.json` shows one history record with the supplied reason.
- **Retained failures:** the rejected first attempt and the two verifier parser errors are explained in `proof/checklist/README.md` and are not counted as evidence.

Finding 2 belongs to the session-note ticket. The other three are cleanups and can follow this PR.

I couldn't write the plan file, post Coder status updates or exit plan mode: this session only had Read, Glob and Grep.
