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

Start with `adventure_start`, then `session_create`. Call
`transcript_upload_url` and upload the file directly from disk with
`curl -T <file> <signed-url>`. The URL is single-use and expires after ten
minutes. The transcript never belongs in a tool call or the assistant's
output.

Claude Desktop and claude.ai have no shell. For them the tool also returns
`pageUrl`, an upload page for that session. The game master opens it, signs
in with the same AuthKit account, and drops the file. The page refuses
anonymous visitors and sessions of another owner. It stores the file
through the same parser and limits as the signed URL. The `split-scenes`
skill tells the model to hand over the link when it cannot run `curl`.

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

`scenes_set` splits the transcript. `debrief_add` accepts changes with a
scene, basis, source quotes, and why, and stores the plot-first `lastTime`
block. Invalid changes are rejected individually while valid ones stay in
the draft. A basis consisting only of `player_guess` and `player_plan` may
only touch threads or character goals. Both endpoints of a relationship
must satisfy that rule. The schema defines all kinds, properties, enums,
and relationship endpoints.

Review `get debrief:<session>`, drop mistakes with `debrief_drop`, and call
`debrief_commit` only after the game master accepts the draft. In clients
that render MCP Apps, `debrief_add` and `debrief_drop` carry the Ledger view
(`ui://omni-gm/draft-debrief`, `_meta.ui`). It shows the "for your session
note" box with `lastTime`, then one row per change grouped by scene: the
operation, the subject, before and after, basis, source quotes, and why.
Its only write is Drop, which calls `debrief_drop` and re-renders from the
returned draft. Both tools also return `ledger` rows for the view. State and
history commit atomically. The committed debrief, transcript, and scenes
stay closed. Dropping a parent refuses to break retained dependent changes and
names them by label, subject, and scene, as the Ledger shows them. Drop them
together, then add replacements in dependency order.
Later corrections remain a later slice.

At prep, `get overview` returns the most recently committed `lastTime`.
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

## Adventure frame talk

At the start of prep, load `skill` with `name: "frame-talk"`. The AI reads
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
history; `get overview` includes the current frame beside `lastTime`.
Starting another adventure gives it a fresh frame and keeps earlier frames
and their commits. Each owner's frame remains private.

## Develop and prove

Use Node.js 24 and PNPM. `convex-mcp-gateway` is pinned to 2.1.1.

```sh
pnpm install --frozen-lockfile
pnpm check
```

The gate builds the Ledger view, then runs Biome, Convex codegen,
TypeScript, and endpoint tests. `pnpm build:ledger` bundles `ledger/` (React
and Tailwind) into one HTML file and writes it to the ignored
`convex/ledgerHtml.generated.ts`; run it before any `convex deploy`. Codegen
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

To see the Ledger view against a preview, run the local MCP Apps host. It
seeds an invented draft, reads the view through `debrief_add`'s `_meta.ui`,
and renders it with the official `AppBridge`, forwarding Drop to the
deployment:

```sh
OMNI_GM_MCP_URL=https://<preview-deployment>.convex.site/mcp \
  OMNI_GM_ACCESS_TOKEN="$STAGING_M2M_ACCESS_TOKEN" PORT=4600 pnpm ledger:host
```

Open `http://localhost:4600/`, or `/?theme=dark` for the dark host theme.

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
`proof/` holds red/green endpoint runs, `proof/ledger/` the Ledger view's, the local gate, SDK e2e, and the
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
per proposal or lastTime block, 100 scenes and 64 KB of scene descriptions
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
latest committed `lastTime` even when its debrief is older than the recent
200-commit history window.
