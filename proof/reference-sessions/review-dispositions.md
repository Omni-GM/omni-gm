# Review dispositions

The required read-only Claude Opus 5.5 review inspected the complete diff
against `origin/main` with #41 and #35 as the oracle. Its unedited findings
are in `opus-review.md`. Provider usage and operational metadata are omitted.

## Original proof gap

B1 was accepted and kept the ticket parked while the preview quota was full.
It is now resolved by the populated-preview upgrade, live endpoint proof,
headless Opus conversation and independent state readback. See
`preview-success-upgrade.log`, `preview-success-reference.log`,
`claude.jsonl` and `headless-verify.log`. The earlier quota refusals remain
as historical artifacts.

## Code findings

- F1 accepted and fixed. The seed's transcript, briefing and history reason
  no longer flag Rook's unrecorded fate. The duty roster neutrally names him;
  only the older transcript establishes his death. The game-master fixture
  does not request a lookup or identify the contradiction.
- F2 accepted and fixed. `overview.latestSession` now identifies the committed
  session behind the stored `briefing`, using the same most recent debrief commit. A
  newer undebriefed draft cannot displace it. The new endpoint test first
  failed on that scenario (`05-red-latest-committed.log`), then passed
  unchanged (`05-green-latest-committed.log`). The redundant two status reads
  and their new index were removed. This is compatible with #38's committed
  session key and #40's stored-briefing behavior.
- F3 rejected after reading the existing `sessionCreate` validation. It
  requires exactly YYYY-MM-DD, checks `Date.parse`, and round-trips through
  ISO format to reject unreal dates. The string index therefore compares
  normalized dates, including for references.

## Lower-severity observations

1. Ordinals intentionally remain stable identifiers in insertion order.
   Renumbering existing sessions would change public `session:s<n>` refs.
   Search labels already include the played date; the served procedure now
   explains that ordinal order is not chronological. The spec's required
   `[S<n> HH:MM:SS]` citation form stays intact.
2. References with a later date still cannot become latest. Keeping that
   invariant stronger than an input-date restriction is intentional. No
   served procedure indexes `sessions[0]`; briefing and the section walk now
   name the explicit committed `latestSession`. Scene/debrief guards protect
   direct clients regardless of how they select a session.
3. The headless verifier currently allows reads only, matching this base.
   The rebased seed includes #38's stored checklist. This base has no stored
   note writes, so the read-only allowlist remains appropriate. A future
   note-writing integration must preserve the story-state invariants.
4. The verifier now requires Rook's actual entity ref before transcript
   search and a named current source, rather than accepting any entity or any
   use of "your". It intentionally requires the fixture's exact death window;
   a different valid window is a rejected proof run, never a false success.
5. The missing-session assertion is unreachable for a visible utterance:
   the preceding loop adds it only after finding that same session in the
   cached map and checking its active transcript generation. No row deletion
   can intervene within this query snapshot.
6. Current-adventure attachment preserves `session_create`'s existing
   contract. Selecting historical adventures is outside #41 and #35's
   reference-session contract; no new adventure selector is introduced.
7. The 201-reference test extends the ordering/latest slice without new
   production behavior. Its feature red is the original reference-create
   refusal. The three implementation slices each retain their failing and
   passing tests. The review fix has its own explicit red/green pair.
8. The PR risk callout already states the rollback limitation: old schemas
   cannot validate stored `reference` statuses. A rollback must retain the
   widened validator while reference rows exist.
9. Pre-existing indexes stay to avoid unrelated cleanup. The unused new
   status/date index was deleted with F2. The procedure now says "last
   inserted session".

The original full local gate after the review fixes passed 76 tests.
No original code finding remains open.

## Resumed integration

The branch was rebased onto `origin/main` after #38, #39 and #40. Their
checklist, secret and stored-briefing records and procedures remain intact.
The reference guards, played-date index and search labels are unchanged.
`latestSession` now pairs with the full stored `briefing` record, using the
same debrief commit. Tests compare that record deeply. The seed stores the
checklist, and the verifier reads it and preserves secrets. The resumed
gate passes 98 tests. That first resumed preview was still quota-blocked.
After the conductor freed slots, the preview deployed and all live acceptance
assertions passed. Two rejected headless attempts are retained; the second
identified an early mixed search, fixed by explicitly reading entity history
before any transcript-inclusive search. The verifier was strengthened, never
relaxed. The passing conversation and unchanged-store readback close B1.
A final read-only Opus review covers this integrated diff and live evidence
separately from the original review.


## Final integrated review

`opus-final-review.md` reviewed the complete rebased diff and the live r3
proof. It confirmed all three acceptance criteria. Every new finding is
handled as follows:

- M1 accepted and fixed. The briefing's transcript pass explicitly uses the
  session being debriefed during debrief review, and `overview.latestSession`
  at prep. A newer draft does not change the prep selection.
- M2 accepted and fixed. General fact gathering again lists entities and
  scenes with an unqueried `find`. The focused doubt lookup still reads
  entity history before any transcript-inclusive search.
- L1 accepted and fixed. Removed the extra same-line question requirement;
  #41 requires the contradiction and its two sources in one line. No new
  question-layout assertion is claimed.
- L2 accepted and fixed. Independent snapshots now follow every secrets
  cursor until null, including empty streams. Both baseline and after-run
  snapshots use all those pages.
- L3 accepted and fixed. The dispositions now name the stored `briefing` and
  the merged checklist. The README identifies the pre-rebase red/green logs.
- L4 accepted and handled by committing the final code and proof, pushing
  them and requiring CI green before the authorized squash merge.

The r3 artifacts seen by this review are retained in `pre-review-run/`.
The root preview and headless artifacts are the post-review rerun on r4.
CodeRabbit skipped its draft review; no CodeRabbit finding was delivered.


The post-review rejected run `rejected-claude-03.jsonl` skipped the full
utterance read and split the contradiction across bullets. Its unchanged
verifier rejected it. The served procedure now explicitly requires `get`
with the conflicting utterance's exact hit ref and keeps both sources in a
single line. This addresses observed behavior at the headless seam; no
assertion was weakened. The final passing rerun exercises that wording.
