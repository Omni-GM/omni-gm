# Develop and prove

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

For the deployed frame proof, run the existing fixture seed with `pnpm e2e`,
then `pnpm exec tsx scripts/frame-e2e.ts` using the same preview URL and
staging token. `proof/frame-talk/` holds this ticket's red/green endpoint
runs, full gate, SDK run and headless frame-talk transcript with independent
readback. Frame history currently rejects reads above 2,000 commits rather
than returning a partial history.

## Feature proofs

Run `pnpm exec tsx scripts/prep-e2e.ts` on a staging branch preview with
`OMNI_GM_MCP_URL` and `OMNI_GM_ACCESS_TOKEN`. It seeds only invented data
and can run again on the same preview. `proof/checklist/` and
`proof/session-note/` hold the headless section-walk proof.
`proof/secrets/` holds the v2 secret endpoint, populated-store upgrade, and
headless plank-to-secret-to-briefing proof; reproduce its readback with
`pnpm exec tsx scripts/verify-secrets.ts`.

Run `pnpm exec tsx scripts/checklist-e2e.ts` on a staging branch preview.
`proof/checklist/` holds endpoint red/green runs, the gate, schema-upgrade
readback over existing records, SDK replacement/validation proof, and a
headless no-vault walk followed by a fresh client using the same checklist.

Run this ticket's hosted proof on a branch preview with the staging token:

```sh
OMNI_GM_MCP_URL=https://<preview-deployment>.convex.site/mcp \
  OMNI_GM_ACCESS_TOKEN="$STAGING_M2M_ACCESS_TOKEN" \
  pnpm exec tsx scripts/schema-e2e.ts
```

The script uses invented data and unique definition names, so it can run
again on the same preview. Its proof bundle is in `proof/schema-change/`.

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
