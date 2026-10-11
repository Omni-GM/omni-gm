# Final review: Omni-GM/omni-gm #14, frame talk (`b6f3b11` against `9b8da65`)

**Verdict: approved against the requested base `9b8da65`.** I found no code blocker, and the proof bundle is now consistent. One merge-readiness item came up while I was reviewing: `origin/main` moved to `16f7904` (#23, the upload page) at 12:54 UTC, after `b6f3b11` was committed. Merging that commit as it stands breaks one frame test without any conflict marker, and causes one conflict in `README.md`. Details are in M1 below.

I worked read-only: no edits, codegen, deploys, comments or secrets.

## Acceptance criteria

| AC | Status | Evidence |
|---|---|---|
| Endpoint red/green tests | ✅ | Red logs `01`–`04` each fail for the stated reason. `green-endpoint.log` and `check.log` both show 34/34 at 12:52. The frame tests are at `tests/mcp.test.ts:885`, `:973`, `:1034` and `:1080`. |
| Official SDK e2e on staging | ✅ | `sdk-e2e.log` ran against `necessary-retriever-154`, the same target as `sdk-preview-deploy.log`. It ran after the deploy (12:51:02, then the seed at 12:52:16, then the e2e at 12:52:20). The custom campaign schema property is added before `beforeStory` is captured, so the comparison checks that the schema survives the frame writes. |
| One headless Claude run, answers up front, no outcome questions | ✅ | All of it ran on `brainy-tortoise-930`, matching `claude-preview-deploy.log`, in order: deploy at 12:51:04, seed at 12:52:18, before-snapshot at 12:52:20, transcript ending at 12:52:51, readback at 12:52:53, which ends with `HEADLESS FRAME TALK PROOF PASSED`. The transcript is in English and contains no hook feedback or reminders. Its sequence is `skill frame-talk`, `get overview`, `get frame`, then one `frame_update` with the exact answers and reason, then a confirming `get frame`. Adventure `j579s…` and sessions `k579y…`/`k57d4…` match `claude-story-before.json` and `claude-seed.log`. |

## Conflict resolution with #22 (`9b8da65`)

- **Commit validator:** the `kind` union in `model.ts` keeps `seed`, `debrief` and `schema`, and adds `frame`.
- **Commits table:** `schema.ts` keeps `schemaChange: commit.fields.schemaChange` and `by_campaign_and_kind`, and adds the optional `adventure`, `before` and `after` fields plus `by_campaign_and_adventure`. All new fields are optional, so existing rows still validate.
- **Overview:** in `store.ts`, the overview is #22's version plus `current` and `frame`. The `latestDebrief` lookup through the index is the same as on main, so there is no duplicate. The `schemaChange` pass-through in `overview.commits` is kept.
- **Tools, skills, tests and imports:** `tools.ts` and `skills.ts` keep `schema_change` and add `frame_update`, `frame-talk` and their input descriptions. Imports resolve, `tsc` is clean in `check.log`, and main's tests are all present (30 + 4 = 34).

## Client validators, scoping and integrity

- **Validators:**
  - `frameFields` is closed: `tools/list` advertises exactly eight keys with `additionalProperties: false`, and an endpoint test asserts this.
  - `frameRead` and `frame` cannot be confused with other members of the `readValue` union, because `history`, `adventure` and `fields` are required.
  - The overview's `frame` is `frame | null`.
- **Scoping:**
  - `campaignFor(caller)` and `currentAdventureFor` together check that `adventure.campaign === campaign._id`.
  - History queries are bounded by both campaign and adventure.
  - Only `frameUpdate` writes `adventure` on a commit, so debrief, seed and schema commits cannot leak into a frame's history.
  - Separate owners and a fresh adventure are tested at `:973`.
- **Integrity:**
  - The commit (reason, full before and after) and the adventure patch happen in one mutation.
  - `frameUpdate` writes only to `commits` and `adventures`. It never writes entities, relationships, history, sessions or the schema.
  - Adventures are never deleted, so `currentAdventureFor` in the overview cannot throw on a dangling pointer.

## Findings

### M1 (Medium, merge-readiness): after merging `16f7904`, the frame isolation test breaks without a conflict marker
- **Where:** `tests/mcp.test.ts:974` (`const shared = createTest();`) and `README.md:46`.
- **What:** #23 moved `createTest` and `client` into `tests/mcp-client.ts`. The merged test file only does `import { client } from "./mcp-client"`. `git merge-tree HEAD origin/main` auto-merges `tests/mcp.test.ts` with no conflict, but in the merged file (around line 908) `createTest()` is not defined. That fails `tsc` and the test.
- **Second issue:** `README.md` has a real conflict on the line that lists later slices. Both PRs remove their own item from it, so the resolved line should read "Later corrections and the Ledger view are later slices."
- **Fix:**
  - Change the import to `import { client, createTest } from "./mcp-client"`.
  - Resolve the README line as above.
  - Rerun `pnpm check`.
- #23 does not touch the frame code paths (`store`, `model`, `schema`). It does touch `skills.ts` and `tools.ts`, but in different procedures and tools.
- ⚑ **Decision for the parent to park:** whether to rerun the deployed SDK and headless proofs after this second reconciliation, or treat a green local gate as enough. Nothing in #23 overlaps the frame behavior, but the proofs would then predate the final merged code.

### L1 (Low, provenance)
- **Where:** `sdk-preview-deploy.log` and `claude-preview-deploy.log`.
- **What:** both deploys ran at 12:51, from the merge working tree before it was committed. `b6f3b11` was committed at 12:53.
- **Evidence it matches:** the deployed index list matches the merged schema (`by_campaign_and_kind` and `by_campaign_and_adventure`). The proof timestamps are consistent with the gate run on the same tree.
- **Gap:** nothing ties the deploy to a specific commit SHA. This is informational and does not block.

### L2 (Low, already accepted): the headless proof does not exercise grounded reads
- **What:** the model skipped the `find` call that opens the procedure, and read no entities. It relied on the overview.
- **Status:** `review-dispositions.md` explicitly accepts this. With every answer supplied up front, the scope is consistent. No new objection.

### Nit
- **Where:** `README.md:140–141`.
- **What:** the new proof paragraph runs straight into `## Change the schema deliberately` with no blank line between them. It still renders correctly; it is only a style issue.

## Prior findings
Every native and CLI finding in `review-dispositions.md` has a decision. I agree with each rejection and each accepted limitation, for the reasons recorded there:
- whitespace and no-op edits
- the overview `take(200)`
- the 2,000-commit cap on frame history
- the first-use `get frame`
- the skill order
- the 0-question proof scope

The earlier proof blockers are resolved: the run is isolated, in English, in the right order, and the readback passes.

## Secrets and public data
- The proof files contain only preview deployment origins. The word "token" appears only in the `uploads.by_token` index name.
- The fixture and all proof data are invented. The transcript has the provider metadata stripped, as the README describes.

**Bottom line:** the diff `b6f3b11` against `9b8da65` is approved. Before landing, fix the `createTest` import and the README conflict from M1 against the current `origin/main`, then rerun the gate. Whether to rerun the deployed proofs afterwards is flagged for the parent to decide.
