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
minutes. Only the signed URL is returned in this slice. The transcript
never belongs in a tool call or the assistant's output.

Use UTF-8 text with timestamped speakers:

```text
[00:01:10] GM as Sera Venn: Mind the stones, dear.
[00:02:20] Rowan: I bet she works for the raiders.
```

Continuation lines belong to the preceding utterance. Timestamps must be in
order. Uploads allow at most 2 MB and 2,000 utterances, with 32 KB per utterance including continuations. Re-upload before
creating scenes or draft changes. The original bytes are kept in file storage;
only their parsed utterances go into the story-state queries.

`scenes_set` splits the transcript. `debrief_add` accepts changes with a
scene, basis, source quotes, and why, and stores the plot-first `lastTime`
block. Invalid changes are rejected individually while valid ones stay in
the draft. A basis consisting only of `player_guess` and `player_plan` may
only touch threads or character goals. Both endpoints of a relationship
must satisfy that rule. The schema defines all kinds, properties, enums,
and relationship endpoints.

Review `get debrief:<session>`, drop mistakes with `debrief_drop`, and call
`debrief_commit` only after the game master accepts the draft. State and
history commit atomically. The committed debrief, transcript, and scenes
stay closed. Dropping a parent refuses to break retained dependent changes and lists
their IDs. Drop them together, then add replacements in dependency order. Later corrections, the adventure
frame, the signed-in upload page, and the Ledger view are later slices.

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

The initial store supports up to 500 changes and 512 KB per draft, 16 KB
per proposal or lastTime block, 100 scenes and 64 KB of scene descriptions
per session, and 2,000 entities or relationships for debrief replay. Overview
returns up to 200 recent sessions, adventures, and commits. Entity history
uses an entity-specific index and allows up to 2,000 changes per entity,
reporting an error beyond that rather than returning partial history.
Search accepts up to eight keywords and uses up to 200
candidates per keyword and type, and returns up to 200 hits; `total` is the
number of matching candidates. Larger campaigns need paginated read paths.

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
