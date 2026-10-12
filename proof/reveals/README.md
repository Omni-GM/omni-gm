# Reveal secrets in the debrief proof

Every fixture, name, secret and decision is invented. No live campaign data is
used. The MCP endpoint is the seam for the records and rules; a headless
client against a branch preview is the seam for what the debrief procedure
makes an agent do. Neither inspects tables or calls internal functions.

## Endpoint proof

- `01-red-endpoint.log`: `tests/reveals.test.ts` run on `origin/main`
  (`926ecb4`) with only the new test file added, one test per run. All four
  fail at their first `debrief_add` with `reveals`, which `main` rejects as an
  unknown argument (the gateway reports it as "Tool execution failed").
- `01-green-endpoint.log`: the same four tests pass on this branch:
  - a commit reveals one secret whole and one in part next to its story
    changes: the whole one is `revealed` and leaves `get secrets`, the partial
    one is `partly_revealed` and stays readable there with its text,
    `openSecrets` drops from 2 to 1, and each gets a `reveal` history entry
    with the debrief commit, session, scene, `learned` and transcript sources;
  - a reveal of an unknown secret, a dropped secret, another owner's secret,
    or a second reveal of one secret in a draft is rejected individually in
    `rejectedReveals`, and the other owner's secret stays hidden;
  - when a pending reveal's secret is dropped before the commit, the commit is
    refused and nothing is applied: the draft reads the same, the change's
    entity does not exist, and the secret history only has write and drop;
  - `debrief_drop` drops a reveal by its id like a change, and the commit then
    leaves the secret hidden with only its write in history.
- `02-red-stale-reveal.log` and `02-green-stale-reveal.log`: the review
  found that a reveal drafted before `secret_write change` widened its secret
  would still close the wider secret. The new test fails on the branch before
  the fix (the commit goes through) and passes after it: each draft reveal
  records `secretVersion`, the secret's latest history commit when it was
  drafted, and `debrief_commit` refuses when the secret changed since, leaving
  the secret `hidden` with its new text and `openSecrets` unchanged.
- `check.log`: the full gate (`pnpm check`) on the final tree, merged with
  `main` after #55; `coherence spec --check` passes there too.

## Headless client proof

`preview-deploy.log` names the source commit, the final tree merged with
`main` after #55, and a fresh staging branch preview. Earlier runs are kept:
`pre-merge/` (before merging #42, #44 and #50) and `pre-review/` (after that
merge, before the review fixes) passed the readback as it was then.
`rejected-attempt-2/` failed it: after the review's stronger checks, the model
noted Coll's secret as unconfirmed but asked only about the knife's crest,
never whether the secret counts as revealed. The debrief procedure now asks
every unsure reveal as its own question, and the final run passes. `seed.log` seeds it with `scripts/reveals-e2e.ts`: an adventure, one
session, the invented 24-line transcript `fixtures/reveals-session.txt`, and
the three hidden secrets of `fixtures/reveals-secrets.json`:

- the miller poisoned the well with nightshade, which he confesses in full
  at 00:04:40 (a whole reveal);
- Sister Wenna leads the river smugglers and hides their silver under the
  chapel floor: the table sees her lantern signals and hears the boatman say
  she gives the orders, but never the silver (a partial reveal);
- the ferryman Coll is the old lord's lost son: a player guesses it at
  00:14:25 and the game master only has Coll shrug (an unsure reveal).

`debrief.jsonl` is one three-turn Claude Opus 5.5 conversation with the
inputs `fixtures/reveals-start.md`, `reveals-answers.md` and
`reveals-commit.md`. The answer was written before the run. The model gets no
procedure text from the operator; it loads `debrief`, `map-speakers`,
`split-scenes` and `briefing` from the store.

`readback.log` runs `scripts/verify-reveals.ts` with a fresh SDK client. It
checks, from the conversation and the store:

- turn one reads `get secrets` and drafts exactly one whole reveal of the
  well and one partial reveal of Wenna, whose `learned` leaves out the silver
  and the floor, every source with its transcript timestamp, and no reveal of
  Coll;
- the review asks about Coll's unsure reveal as one numbered, timestamped
  question, with at most five questions;
- the answer keeps Coll unrevealed, and the commit happens only in turn three;
- after the commit the well is `revealed`, Wenna `partly_revealed` and still
  listed in `get secrets` with her full text, Coll `hidden` with only its
  write; both reveals carry the debrief commit, session, scene, `learned` and
  sources in their history, and `openSecrets` is 2;
- what the players learned of both secrets is a committed story change on
  the reveal's transcript lines that names its subject and states the fact
  (the poisoning; Wenna's orders or signal), not on a guess basis, no entity holds the unseen rest, and the stored
  briefing names it only on a line marked "(secret)".

This is one model-behavior proof, not a guarantee that every model follows a
skill.

## Populated-store upgrade

`reveals` is an optional field on `sessions`, so stored drafts stay valid.
`upgrade-base-deploy.log` deploys `main` (`926ecb4`) to this worker's own
preview, and `upgrade-before.log` stores a draft debrief there with one change,
a briefing and one hidden secret, with no `reveals` field.
`upgrade-deploy.log` deploys this branch over the same deployment with
`--preview-name`. `upgrade-readback.log` reads the stored draft with its change
and briefing intact and `reveals: []`, adds a reveal to it and commits: the
secret is `partly_revealed` with its reveal on the debrief commit.

`rejected-attempt-1/` keeps a first upgrade attempt that deployed the branch
with `--preview-create`. That replaced the preview with a new, empty
deployment instead of upgrading it, so it proves nothing and was redone.

Every preview of this ticket was deleted after its proof.
