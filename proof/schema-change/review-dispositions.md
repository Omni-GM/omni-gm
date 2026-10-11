# Review dispositions for PR #22

GPT-6.1 Sol checked the findings from both read-only Claude Opus 5.5 reviews
against the code. The first reviewed head was 67e96ca. The native review
used T3 delegation; the literal CLI review used `claude -p --model
claude-opus-5-5` with read-only tools and plan permissions.

## Fixed

- Native finding 1 and CLI F1/F2: replay errors for existing draft changes
  now name the pending ID, give the reason and instruct the client to drop
  it first. Drop errors describe invalid remaining changes, including their
  reasons, without incorrectly classifying every failure as a dependency.
  `red-pending-errors.log` and `green-pending-errors.log` prove the gap and
  repair through add, drop and commit. The hosted SDK also exercises the
  stale-add and stale-drop errors before dropping the retired-field write.
- CLI F3, the correctness part: overview now looks up the latest debrief
  through a campaign-and-kind index independently of the recent 200 commits.
  `red-recall.log` and `green-recall.log` prove lastTime survives 200 later
  schema commits. The complete gate preserves all existing recall tests.
- CLI B1: the reviewer caught a transient proof re-run aimed at an old
  preview after Convex recreated it. The final run derives its target from
  the final deploy log. Both SDK runs and the existing SDK suite pass on
  that same target. The final proof logs are committed together.

## Rejected as required changes, with reasons

- Native finding 1 / CLI F1's broader proposal to append new submissions
  while a stored draft is invalid: the existing draft must replay before
  temporary references and current state can be validated. Automatically
  removing accepted proposals would change the reviewed draft. The fixed
  error names the repair; dropping that proposal lets valid new proposals
  succeed with their existing per-proposal rejections. No accepted draft
  changes disappear, and no invalid draft can commit.
- Native finding 2 / CLI F3's compact-overview proposal: full schema
  snapshots currently give the MCP client an auditable before/after record
  through the existing overview contract. Each schema commit is capped at
  32 KB and overview at 200 recent commits. Moving snapshots to a new ref
  would expand the public read contract beyond this ticket. Compact and
  paginated history remains a follow-up for the conductor, consistent with
  the capacity follow-up already recorded in #13. The actual lastTime bug
  is fixed above.
- Native finding 3, live descriptions: descriptions are preserved verbatim
  in the schema operations returned in commit history. #18 requires immediate
  use, retirement and its reason in history; #11 does not require descriptions
  in get schema's live value-type map. Serving live descriptions is a possible
  follow-up, not missing acceptance behavior.
- Native finding 4, automatic starter-schema propagation: each changed
  schema belongs to one campaign. Silently replacing it on deployment would
  violate deliberate schema changes. Existing campaigns without a stored
  schema use the starter definitions; future starter-schema migrations for
  customized campaigns must be explicit. This one-way effect is declared
  in the PR's risk callout.

Neither review found a correctness, isolation, atomicity, retirement,
compatibility or Convex-runtime blocker. CodeRabbit skipped the draft PR.
No human decision remains open. Follow-ups are reported on #18 rather than
creating or editing any other ticket.

## Fixes review

The second native Opus review approved 8d4a87c and all dispositions, with no
remaining blockers or required follow-ups. See opus-fixes-review.md.
Its two optional nits are rejected as required changes: add, drop and commit
all use the same tested pending-change helper, and the drop error gives the
exact additional IDs and names the correct retry tool. Neither changes the
repair path or leaves an untested write path.
