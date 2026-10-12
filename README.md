# omni-gm
A game master's companion that connects what happens at the table with what you need at prep time. For D&amp;D, Daggerheart, and other TTRPGs.

## Debrief and recall over MCP

Connect your AI client to the live HTTP endpoint with WorkOS AuthKit sign-in:

```sh
claude mcp add --transport http omni-gm https://<live-deployment>.convex.site/mcp
```

In Claude Code, use `/mcp` to sign in. Load `skill` with `name: "debrief"`
before starting. The procedure also loads `map-speakers` and `split-scenes`.
The server stores and validates the story state; it makes no AI calls.

Start with `adventure_start`, then `session_create` and `transcript_upload_url`.
With a shell and a file on disk, the agent runs `curl -T <file> <signed-url>`
directly from disk. The URL is single-use and expires after ten minutes.
This path sends no transcript tokens through the model.

Without a shell, as in Claude Desktop or claude.ai, or without the original
file on disk, the agent immediately
gives you `pageUrl` to sign in and upload the original transcript file.
It waits for the upload, then reads `get transcript:<session>` to confirm
that the transcript is stored before mapping speakers, splitting scenes,
or starting the debrief. Never retype the transcript into tool calls or chat.

Both paths use the same parser, bounded storage batches, owner scoping,
and lock once scenes or draft changes exist. Failed uploads keep the
previous transcript readable; only a successful upload publishes a replacement.
The page requires the same AuthKit sign-in and refuses other owners' sessions.

Use UTF-8 text with timestamped speakers:

```text
[00:01:10] GM as Sera Venn: Mind the stones, dear.
[00:02:20] Rowan: I bet she works for the raiders.
```

Continuation lines belong to the preceding utterance. Timestamps must be in
order. Uploads allow at most 8 MB and 20,000 utterances, with 32 KB per utterance including continuations. Re-upload before
creating scenes or draft changes. The original bytes are kept in file storage;
only their parsed utterances go into the story-state queries. Parsing writes bounded
batches into a new transcript generation. Reads and search switch to it only
when the upload finishes. Replaced or abandoned generations are cleaned up
in bounded batches.
An explicit deployment write-rate rejection retries its batch with bounded
backoff. Other failures keep the earlier transcript and return retry guidance.

`scenes_set` splits the transcript. `debrief_add` accepts changes with a
scene, basis, source quotes, and why, and stores the draft `briefing`, the
review the game master reads. Invalid changes are rejected individually while valid ones stay in
the draft. A basis consisting only of `player_guess` and `player_plan` may
only touch threads or character goals. Both endpoints of a relationship
must satisfy that rule. The schema defines all kinds, properties, enums,
and relationship endpoints.

Omit a source's `at` when it has no timestamp; a supplied value must be a
valid timestamp, including in an older pending draft. If an old draft has
`at: ""`, read its IDs with `get debrief:<session>`, drop those changes and
their dependents together, then re-add them with `at` omitted or corrected.
Drop errors name any invalid remaining IDs that also need removal.

Review `get debrief:<session>`, drop mistakes with `debrief_drop`, and call
`debrief_commit` only after the game master accepts the draft. `debrief_add`
and `debrief_drop` return the draft and refuse in plain text; no tool carries a UI
resource. State and history commit atomically. The committed debrief,
transcript, and scenes stay closed. Dropping a parent refuses to break
retained dependent changes and names them by label, subject, and scene. Drop
them together, then add replacements in dependency order.
Later corrections use `story_commit`.

`debrief_commit` refuses a draft without a briefing and keeps the briefing
with the committed session. At prep, `get overview` returns it as `briefing`
(`session`, `commit`, `text`, and the 200 newest `story` commits written
since as `correctionsSince`, oldest first), or `null` before the first commit with a briefing, and
the `briefing` skill opens prep with that text instead of regenerating it.
`find` lists entities and scenes without a query, or searches names,
aliases, property values, scenes, source quotes, and transcript utterances.
`get entity:<id>` returns properties such as `playedAs`, relationships, and
history with each session, scene, basis, quote, and reason. `get` also reads
`schema`, `session:<id>`, `scene:<session>/<ordinal>`, and
`transcript:<session>[@<timestamp>]`. A timestamp selects a one-minute
window either side. Its `downloadUrl` requires the same owner's bearer
sign-in and returns the original bytes. One ref returns `{value}`; up to
25 refs return `{value: null, items: [{ref, value}]}`. Every tool returns
MCP `structuredContent`.

`get transcript:`, timestamp windows, `get scene:` and `get entity:` history
return a page with `truncated` and `nextCursor`. Send that cursor back as
`cursor` with the same single `ref`. `limit` accepts 1 to 200, default 100.
Transcript and scene pages also stop at a database byte budget; history
pages contain at most ten changes. Multi-ref reads give each item its own
continuation. Continue each item separately with its ref. A transcript
replacement invalidates its earlier cursors.

`find` also returns `truncated`, `nextCursor`, and stable hit `id` values.
Keep its query, types and kinds unchanged when following the cursor; the
page size may change. Follow a continuation even when its page has no hits.
The `total` counts hits seen so far, a lower bound until `totalIsExact` is
true. Read all pages against an unchanged store for a complete count.
Search matches whole keywords, ignoring case and stop words, with any
matched keyword sufficient. Results visit entities, sources, scenes, then
transcripts; entity kind filters visit each kind in order.
`order: "type_then_page_relevance"` means more matched keywords rank higher
within a page. Page order is not a global relevance ranking. Campaign
indexes bound the scan and avoid Convex text search's 1,024-result ceiling.
Each request scans up to 4,000 rows, 4 MB of documents, or 400 internal
pages, stopping sooner when it fills the requested hits. A database page
can cross the byte budget by one page. Sparse searches in larger stores
still need continuation, including empty pages.

## Briefing

Prep opens with `skill` and `name: "briefing"`. Before you say anything, the
AI reads `get overview`, every committed entity with its history, and makes
one optional pass over the latest transcript for what the story state lacks.
It writes one plot-first page of 400 to 600 words in a fixed order: where the
party stands, what pulls, forgotten threads, NPCs in play, clocks and
pressure, two or three off-screen moves, store corrections and frame flags
when needed, and two or three numbered "what next" options with the
recommended one first. Every fact carries a source: `[HH:MM:SS]` for the
latest session, `[S<n> HH:MM:SS]` for an older one, or the entity name.
Claims are marked as an NPC's word, a rumor, a player guess or a player plan.
A gap is a flag, never an invented fact. Store corrections are written with
`story_commit` only after your okay. With an empty frame the recommended
option is a short frame talk; with only flagged fields it comes second.

## Adventure frame talk

Load `skill` with `name: "frame-talk"` when the briefing offers it or a new
adventure starts. When the briefing flagged only some fields, the short form
asks about just those. The AI reads
`get overview`, `get frame`, and the committed story state. It asks one
question at a time, grounded in a named thread, NPC, clock, or character goal,
and explains why it asks. You decide the situations and pressure. It never
asks what the players will choose or how a scene ends.

The talk stops when goal, stakes, and timeframe are named and you are
satisfied. Optional fields are pressure, finale situation, how it moves the
main plot, what it pulls in, and where the next session starts. Later talks
ask only about missing or unclear fields and those the last session put in
question. Answers supplied up front do not need another question.

`frame_update` saves only the supplied fields of the current adventure,
with your reason. Omitted fields stay as they were; an empty string clears
a field by storing `""`. A reason and at least one field are required. It appends a `frame`
commit with the full before and after, atomically with the edit. Intent never
changes story state. `get frame` returns the fields and that adventure's
history; `get overview` includes the current frame beside the stored briefing.
Starting another adventure gives it a fresh frame and keeps earlier frames
and their commits. Each owner's frame remains private.

## Section walk and plank answers

Load `skill` with `name: "prep-sparring"` after the briefing. Give the AI
your prep checklist, each section's definition, and your markdown session-note
template once, from your notes vault or pasted in chat. It stores them with
`checklist_set` and reads `get checklist` in every later client, including
clients without vault access. When none is stored, it asks once for all
three before starting. It walks your stored sections in
order: at most five sourced facts, then pitches shaped by the section's
definition, then your turn. Scenes and strong starts get two or three
situations, each saying what it is built on; a secrets-and-clues section in
the Lazy DM style gets ten tweet-short, character-facing items. Sections
where you brought your own material, and mechanical ones, get no pitches.
It asks only about a contradiction with the story state or one plank
question per section. You pick, mix, reshape or ignore; only your picks
enter the note, shown back in two or three lines, and every section closes
with numbered next options.

A missing main-plot background answer loads `plank-questions`. The AI asks
one targeted question and explains why. Your confirmed unplayed answer goes
to `secret_write` in your words with your reason. It stays apart from entities
and their history. Only a correction of what the table already saw uses
`story_commit` with `basis: ["game_master"]`. The briefing and section walk
read open secrets and mark them "(secret)" with their full ref. A secret does
not settle what the players know; their unresolved threads stay open.

`secret_write` takes `op`, `reason`, and these fields:

- `write`: `text`, optionally `about` with existing owner-scoped entity ids
  or `entity:<id>` refs. It returns a stable `secret:<id>` ref, `hidden`
  status, and a commit id.
- `change`: `secret` and the changed `text` or `about`. Omitted fields stay
  as they were.
- `drop`: `secret`. Its record and history remain readable with status
  `dropped`.
- `fix`: `secret` and `storyCommit`. First commit the story-state change
  through `story_commit`, with `game_master` basis and the secret's exact
  text as a source quote, or a compact game-master declaration as source and
  its full secret ref in the change's `why`; pass its returned commit id. The secret becomes
  `fixed`, and its commit records which story commit fixed it.

Every operation requires a non-empty reason within 2 KB and appends separate
secret history with `commit`, `op`, `reason`, `before`, and `after`. Text must
be non-empty and at most 16 KB in UTF-8. `about` accepts at most 50 entity refs,
200 bytes each. Secret and story-commit refs are also capped at 200 bytes.
`get secrets` pages through `hidden` and `partly_revealed`
records only; follow every continuation, including empty pages. Each page
also returns `writtenSinceDebrief` ids so a stored briefing can add just the
background written or changed since its debrief.
`get secret:<id>` reads any status with paginated history, at most ten rows
per page. `get overview` returns the exact `openSecrets` count. Secret
writes do not enter entity or source search.

The debrief reads open secrets with the transcript. `debrief_add` also takes
`reveals: [{secret, scene, learned, sources, whole}]` for a `hidden` or
`partly_revealed` secret of the caller's campaign, at most one per secret in a
draft; an unknown, closed or other owner's secret is rejected individually in
`rejectedReveals`. `get debrief:<session>` lists them, and `debrief_drop`
drops a reveal by its id like a change. `debrief_commit` applies changes and
reveals together or not at all: a whole reveal sets `revealed` and lowers
`openSecrets`, a partial one sets `partly_revealed` and keeps the secret and
its text readable in `get secrets`. Each appends a `reveal` history entry with
the debrief commit, session, scene, `learned`, and transcript `sources`. What
the players learned is also written as ordinary draft changes; the unseen rest
stays secret.

`story_commit` also corrects committed mistakes outside a debrief. Supply
`reason` and `changes: [{change, basis, sources, why}]`, without a session
or scene. It uses the same kinds, properties, enums, relationship endpoints
and guess restrictions as the debrief. The whole batch changes state and
appends history atomically; a rejection keeps nothing. `$tempKey` resolves
a new entity from an earlier change in that batch. The current campaign's
schema applies, including retired properties. It changes neither committed
debriefs nor frames nor the stored briefing. `get entity:<id>` shows its before/after,
basis, sources and why; `get overview` shows the `story` commit and reason.
History from a story commit has no session or scene fields.

Source search hits include a structured `basis` alongside the marked quote.
Source and utterance hits rank keyword matches within each page. Each source ref
reads the entity's history; each utterance ref reads
`transcript:<session>@<timestamp>` for nearby context. A raw utterance is not
itself a validated fact.

At the end the AI assembles your picks in your template, in your words and
language, without padding for skipped sections. Your prep stays in your
session note; unplayed background lives in the secret store and does not become story state. `story_commit` accepts 1 to 500 changes, at most 16 KB
per change and 512 KB for the reason and batch together. The existing
2,000-entity/relationship replay capacity also applies.

Run `pnpm exec tsx scripts/prep-e2e.ts` on a staging branch preview with
`OMNI_GM_MCP_URL` and `OMNI_GM_ACCESS_TOKEN`. It seeds only invented data
and can run again on the same preview. Use `--seed-only` for the headless
sparring fixture. `proof/prep-sparring/` holds the endpoint red/green runs,
full gate, SDK run, headless conversation and independent readback.
`proof/secrets/` holds the v2 secret endpoint, populated-store upgrade, and
headless plank-to-secret-to-briefing proof; reproduce its readback with
`pnpm exec tsx scripts/verify-secrets.ts`.

`checklist_set` takes `sections: [{name, definition}]`, `template` and a
non-empty `reason`. It replaces the whole checklist for the owner's campaign,
preserving the supplied words, markdown and section order. It requires
1 to 100 sections, non-empty names and definitions, distinct section names
ignoring surrounding whitespace and case, and a non-empty markdown template.
The sections, template and reason together must fit within 32,000 UTF-8 bytes
as JSON. A rejection changes neither the checklist nor its history.

`get checklist` returns `{checklist, history, truncated, nextCursor}`. An
unset checklist is `null`; a stored one contains `sections` and `template`.
Each history entry has `commit`, `reason`, `before` and `after`, including
the initial write with `before: null`. History is oldest first, at most ten
versions per page. Follow `nextCursor` with the same ref to read the rest.
Starting another adventure retains the campaign's checklist. Other owners
cannot read or replace it.

Run `pnpm exec tsx scripts/checklist-e2e.ts` on a staging branch preview.
`proof/checklist/` holds endpoint red/green runs, the gate, schema-upgrade
readback over existing records, SDK replacement/validation proof, and a
headless no-vault walk followed by a fresh client using the same checklist.

## Develop and prove

Use Node.js 24 and PNPM. `convex-mcp-gateway` is pinned to 2.1.1.

```sh
pnpm install --frozen-lockfile
pnpm check
```

The gate runs Biome, Convex codegen, TypeScript, and endpoint tests. Codegen
uses an isolated anonymous local Convex deployment in `.codegen/` with
an empty auth configuration. It never uses a deploy key or a hosted
campaign. The actual auth configuration stays required and is typechecked.
The first gate run downloads Convex's local backend, so it needs network
access. The test seam is JSON-RPC through the gateway's HTTP route inside
`convex-test`, including the signed upload and authenticated download routes.
Tests neither call domain functions nor read tables.

For hosted proof, deploy only a branch preview with a preview deploy key:

```sh
CONVEX_DEPLOY_KEY="$CONVEX_PREVIEW_DEPLOY_KEY" pnpm exec convex deploy \
  --preview-create <branch> --preview-run oauth:configure --yes
OMNI_GM_MCP_URL=https://<preview-deployment>.convex.site/mcp \
  OMNI_GM_ACCESS_TOKEN="$STAGING_M2M_ACCESS_TOKEN" pnpm e2e
```

`scripts/upload-page-proof.sh` signs in to a preview's upload page as the
staging test user in a fresh agent-browser session. It checks the refusals,
drops `fixtures/session.txt`, and compares the stored bytes. It reads the
site, the test user, and a second owner's token from the environment.

Preview deployments trust staging WorkOS AuthKit. The live deployment
trusts production. GitHub Actions runs the gate for PRs and `main`, then
`deploy-main` deploys `main` using the repository's `CONVEX_DEPLOY_KEY` and
configures OAuth discovery. Unmerged code never deploys to live.

Use invented data for every proof. `fixtures/session.txt` exercises name
variants, a voiced NPC, a rumor figure, a player guess, and a clock.
`proof/` holds red/green endpoint runs, the local gate, SDK e2e, and the
Claude fixture transcript with upload capabilities and provider usage
removed. `scripts/verify-claude.ts` checks procedure ordering and reads
back the committed store independently. Per-branch previews replace the
spec's second project as resolved in #12. Deployment logs identify each
proof target. The SDK proof can run again on the same preview; it locates
its NPC by the current session's history.

`pnpm exec tsx scripts/e2e-long-transcripts.ts` uses the same environment
variables. It generates an invented four-hour session with 4,801 utterances,
uploads it, splits four scenes, verifies exact file bytes, and reads every
utterance through both transcript and scene pages. It also searches all
4,800 marked utterances and checks batch reads on the hosted preview. A
unique search marker makes the script repeatable on one deployment.
Its evidence is under `proof/long-transcripts/`.

The initial store supports up to 500 changes and 512 KB per draft, 16 KB
per proposal or briefing, 100 scenes and 64 KB of scene descriptions
per session, and 2,000 entities or relationships for debrief replay. Overview
returns up to 200 recent sessions, adventures, and commits. Entity history
uses an entity-specific index and continues beyond 2,000 changes. Search
accepts up to eight keywords and returns up to 200 hits per page without
a campaign-wide candidate cap. The overview remains a recent summary; the
paginated paths cover transcripts, scenes, entity history, and find.

For the deployed frame proof, run the existing fixture seed with `pnpm e2e`,
then `pnpm exec tsx scripts/frame-e2e.ts` using the same preview URL and
staging token. `proof/frame-talk/` holds this ticket's red/green endpoint
runs, full gate, SDK run and headless frame-talk transcript with independent
readback. Frame history currently rejects reads above 2,000 commits rather
than returning a partial history.

## Change the schema deliberately

Call `schema_change` only when the game master explicitly asks. Supply a
non-empty `reason` and an `ops` list. The whole list commits atomically:

- `add_property`: `kind`, `key`, `type` (`text`, `number`, or `enum`), and
  `description`. An enum also needs distinct, non-empty `enumValues`.
- `retire_property`: `kind` and `key`. Old entity values and history stay
  intact. New writes and pending draft commits reject the retired property.
  Errors name the pending change ID. Drop it with `debrief_drop` first, then
  add a replacement before committing.
- `add_relationship_type`: `type`, `from` and `to` lists of existing kinds,
  `label`, `inverseLabel`, and `description`.

New definitions are usable immediately. `get schema` returns the campaign's
live definitions and `retiredProperties`. Retired keys cannot be reused.
`get overview` includes `schema` commits with the reason, operations, and
before/after definitions, alongside debrief commits. Changing a schema never
changes story-state values. There are no new kinds, deletes, or renames in v1.
Property keys and relationship type names start with a letter, contain only
letters, digits or underscores, and cannot be reserved entity or JavaScript
prototype names.

Run this ticket's hosted proof on a branch preview with the staging token:

```sh
OMNI_GM_MCP_URL=https://<preview-deployment>.convex.site/mcp \
  OMNI_GM_ACCESS_TOKEN="$STAGING_M2M_ACCESS_TOKEN" \
  pnpm exec tsx scripts/schema-e2e.ts
```

The script uses invented data and unique definition names, so it can run
again on the same preview. Its proof bundle is in `proof/schema-change/`.

Schema changes accept 1 to 100 operations. The reason, operations and
before/after definitions together must fit within 32 KB per schema commit.
A rejection changes neither definitions nor history. Overview keeps the
latest committed briefing even when its debrief is older than the recent
200-commit history window.

For upload-path proof, run `pnpm exec tsx scripts/e2e-agent-upload.ts` with
the same preview URL and staging token. It uploads an invented four-hour,
4,801-utterance transcript by signed URL, reads every page, compares original
bytes, and verifies the scene lock. Add `--max-bytes` to pad the fixture to
exactly 8,000,000 UTF-8 bytes.

`proof/transcript-retirement/` holds the retired-tool red/green runs, full
gate, existing-staging-data migration proof, and headless shell and no-shell
runs. The no-shell agent gives the GM the upload page and waits. After the
file is stored, a fresh run reads it before writing scenes. The shell agent
uploads from disk without repeating the transcript in its output.

Run `pnpm check` before manual deployment. Main deployments use
`bash scripts/deploy.sh`. If legacy staging exists,
it deploys a temporary
migration schema that accepts the retired chunk fields, with the chunk tool
already removed, then deletes chunk staging in bounded batches before
deploying the narrowed schema. Published transcripts, sessions and story
state stay intact. Preview proof uses the same script with a preview branch
name as its only argument. The migration files are deployed only for the
cleanup and are absent from the final deployment. Later deployments skip
the migration once staging is empty.

Prep picks are saved immediately with `note_write`. `get note` returns the
current prep's ordered entries and its saved checklist/template;
`get overview` includes `prep` with `done`, `skipped`, `open` and the first
open `nextSection`. Both are null until a checklist and committed debrief
exist. The note is keyed to the latest committed debrief, so draft sessions
and reference transcripts do not restart prep. A new committed debrief
starts a new note. Each write must name the session returned by `get note`;
a stale client is refused rather than writing into the next prep.

Use `op: upsert` with `section` and `entry` and/or `status` (`open`, `done`,
`skipped`). Omitted fields and other sections stay unchanged. The first
write keeps that prep's checklist definitions and template, so later
checklist replacements apply to the next prep. `op: finish` requires every
section to be done or skipped. Finished notes are read-only until
`op: reopen` with a non-empty reason, followed by separate edits. The note
keeps the latest reopen reason. Entries are bounded at 16,000 UTF-8 bytes,
reopen reasons at 2,000, and the complete note at 128,000 JSON bytes; rejection
writes nothing.

The served `prep-sparring` procedure resumes from saved progress and
assembles the finished entries in the saved template, in the game master's
words and language. Claude Code also writes the finished markdown into the
vault; clients without vault access show markdown to paste. Rendering and
vault writes happen in the client, never on the server. The endpoint and
fresh-conversation stop/resume proof is in `proof/session-note/`.

### Older transcripts

Create an older transcript-only reference with `session_create` using
`playedOn: "YYYY-MM-DD"` and `reference: true`, then use the ordinary signed
transcript upload. References have status `reference` and cannot receive
scenes or a debrief. The overview orders sessions by played date;
`latestSession` identifies the session behind the most recent debrief commit and its stored briefing,
excluding references and undebriefed drafts. Stable session ordinals do not
change when an older transcript is added.

Transcript `find` hits include the session id, ordinal and played date. The
section walk checks committed story state first and searches older transcripts
only when a doubt needs them, citing the current game-master words and the
older timestamp in one line. It never bulk-debriefs reference sessions.
See [the proof bundle](proof/reference-sessions/README.md).
