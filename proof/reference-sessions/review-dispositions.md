# Review dispositions

The required read-only Claude Opus 5.5 review inspected the complete diff
against `origin/main` with #41 and #35 as the oracle. Its unedited findings
are in `opus-review.md`. Provider usage and operational metadata are omitted.

## Blocking proof gap

B1 is accepted. Convex refused the branch-preview creation because the team's
deployment quota is full. No headless run or populated-preview upgrade is
claimed. The proof README now states that limitation. The PR remains a draft
and must not merge until the live acceptance artifacts pass.

## Code findings

- F1 accepted and fixed. The seed's transcript, briefing and history reason
  no longer flag Rook's unrecorded fate. The duty roster neutrally names him;
  only the older transcript establishes his death. The game-master fixture
  does not request a lookup or identify the contradiction.
- F2 accepted and fixed. `overview.latestSession` now identifies the committed
  session behind `lastTime`, using the same most recent debrief commit. A
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
   After #38 merges, the resume must seed its stored checklist and account for
   checklist/note writes before re-running proof. This is a proof adaptation,
   not permission to skip the headless acceptance criterion.
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

The full local gate after the fixes passes 76 tests. No code finding remains
open. B1 remains the sole merge blocker.
