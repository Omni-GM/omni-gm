I'm Claude Opus 5.5 (`claude-opus-5-5`) and reviewed the staged diff (`git diff --cached origin/main`) read-only. I found no security blockers. Four correctness gaps should be fixed before merge, all cheap. I confirmed three of them by reproduction.

**How I checked:** I read the spec (#11), ticket #13, the setup resolution (#12), the ADR, all of `convex/`, the tests, CI, scripts and `proof/`. I ran a scratch vitest suite through the same in-process MCP seam, in a `/tmp` copy that symlinked `node_modules`. I deleted the copy afterwards. I edited nothing in the worktree, didn't touch GitHub, and didn't deploy.

## Fix before merge

**1. Dropping a parent change breaks the whole draft, so per-item rejection stops working.**
- `convex/debrief.ts:277-280`: `add` replays the stored draft outside the per-item `try`, so one stale change throws for the whole call. `drop` (`:324-327`) never checks for dependants.
- Repro: add `new npc tempKey sera` and `update $sera`, drop the first, then `debrief_add` a valid thread. The result is `isError: "Entity not found: $sera…"` and the valid thread is not kept. `debrief_commit` fails the same way.
- Why it matters: user story 19 says valid changes stay in the draft. The Ledger's one-click drop (#24) will hit this often. The error doesn't say which kept change is the stale one.
- Your test at `tests/mcp.test.ts:374` treats this as intended.
- Fix: either refuse the drop and list the dependent ids, or cascade the drop. Separately, mark stale replayed changes in the result instead of throwing.

**2. Find in list mode ranks every scene above every entity.**
- `search.ts:98-105` gives list-mode entities no score. `add()` gives each scene score 1, and `:169` sorts by score.
- Repro: one NPC and one scene, then `find {limit:1}` returns only the scene (`total: 2`).
- Why it matters: from about 100 scenes on (10–15 sessions), `find {}` with the default limit returns no entities. That is the call the `debrief` skill uses to "see the committed story state", so the AI would start creating duplicates.
- Fix: list entities first, or don't score in list mode and keep insertion order.

**3. The query tokenizer splits non-ASCII words apart.**
- `search.ts:56` uses `split(/\W+/)` without the `u` flag.
- Checked with node: "Jörg" becomes `["j","rg"]`, "Kühn" becomes `["k","hn"]`, "Straße" becomes `["stra","e"]`.
- On real Convex each fragment is a one-term prefix search. "j" matches every word starting with j, and "rg" matches almost nothing. Name lookup in the game master's language (a standing rule) breaks.
- convex-test's search is too lenient to show the miss, so this one is reasoned, not reproduced.
- Fix: `split(/[^\p{L}\p{N}]+/u)`.

**4. Reading an entity's history scans the whole campaign's history.**
- `store.ts:216-221, 252-253` takes up to 2,001 history rows for the campaign and filters in memory. It errors outright above 2,000.
- A `get` with 25 entity refs reads that up to 25 times. History rows carry `before`/`after` entities and quotes, about 1–2 KB each, so the per-query read limit (~16 MiB) is hit at a few hundred history rows. That is only a handful of sessions.
- The README documents the 2,000 cap but not the batch failure.
- Fix: index the entity ids. Either one history-link row per entity id indexed on `[campaign, entityId]`, or an index on a scalar field. The table shape is cheaper to change now than to backfill later.

## Should fix (medium)

5. **Unbounded query words.** `find` runs up to 4 searches × 200 rows per word (`search.ts:71-168`). A pasted sentence of about 40 words reaches the document or byte read limits. Cap the number of words (for example, 8).
6. **No size cap on draft text.** All draft changes live on the session document (`schema.ts:22`). The 500-change cap exists, but quote, `why` and `lastTime` lengths have no cap. A large draft can pass Convex's 1 MiB document limit, and then the whole `debrief_add` fails with an unclear error. Cap the string lengths, or move draft changes to their own table.
7. **Unwindowed transcript read returns everything.** `get transcript:<s>` without `@` returns up to 2,000 utterances (`store.ts:195`), which is far over Claude Code's tool-output limit. This matches the spec, so it's a follow-up: add an explicit range or pagination.
8. **Missing red evidence.** The acceptance criteria ask for red then green for "each server rule", owner scoping and atomic commit. `proof/05-green-rules.log` has no red log. The owner-scoping and atomic tests have no red log anywhere. The existing reds (01–04, 06–08) fail for the right reasons.

## Low / optional

- **Draft entity ids:** `entity:draft-c1` refs are accepted by `add` but break `commit`, which assigns UUIDs (reproduced). Reject non-`$` refs to draft ids.
- **Scene boundary:** a scene read includes the next scene's first utterance because of the inclusive `lte` at `store.ts:293` (reproduced: scene 1 returns `["one","two"]`).
- **`kinds` filter:**
  - It is applied in memory after the top-200 search window (`search.ts:90`), and the `kind` filter field on the search index goes unused.
  - It doesn't apply to source or transcript hits (reproduced).
  - Unknown kinds aren't rejected.
- **Overview order:** commits and adventures use ascending `take(200)` (`store.ts:156-163`), so they return the oldest 200. The README says "recent".
- **Tool descriptions:**
  - `debrief_drop` says "Drop rejected changes" (`tools.ts:61`), but rejected changes never enter the draft.
  - The test title "cannot borrow an MCP session" (`tests/mcp.test.ts:415`) claims more than the test checks; it never reuses another owner's session id.
- **Upload:**
  - Any `finish` failure, such as a document-size error, returns 403 "Expired, used or locked URL" (`uploads.ts:140-143`).
  - Expired upload tickets are never cleaned up.
  - Please confirm that `crypto.randomUUID()` inside a mutation (`uploads.ts:28`) is strong enough for a bearer capability. If unsure, mint the token in an action.
- **Claude proof checker:** `verify-claude.ts` checks only assistant text blocks for transcript echoes, not tool-use inputs. I checked `claude.jsonl` by hand: the only Bash call is `curl -T`, so the claim holds for this run.
- **SDK e2e is not re-runnable** on the same preview. It asserts exactly one "Sarah Ven", which breaks on a second run.
- **Seed commit is an empty marker.** The schema is a constant, so `schema_change` (a later ticket) will need per-campaign schema storage.
- **Scoping uses `subject` only.** That's fine while each deployment trusts one issuer.
- **CI actions are pinned by tag, not SHA.**

## Verified as sound

- **Identity:** the gateway (2.1.1, exact pin) removes any client-sent `caller` and injects the identity itself (`mcp-handler.js:3621`). `caller` is absent from the advertised schema (tested). `requireAuth` plus `authorize` reject anonymous calls (tested in-process and in the e2e).
- **Owner scoping:** every handler resolves the campaign from `caller.subject`. `sessionFor` checks campaign ownership, and download requires the same owner.
- **Single-use signed URL under concurrency:** two parallel PUTs gave `200` and `403`, and only the first body was stored. The `finish` mutation re-checks under OCC, and the losing request deletes its stored blob.
- **Atomic commit:** replay, state update and history append run in one mutation. A failed commit leaves no state, history or commit row (tested).
- **Rules 1–5:** enforced per item, with allowed-value lists. Prototype-key lookups like `constructor` are blocked. Server instructions are under 4,096 characters, and every loaded procedure ends with the standing rules.
- **CI/live isolation:** pull-request runs get no secrets. `deploy-main` runs only on push to `main` after `check`. Codegen uses an anonymous local deployment with empty auth.
- **Proof bundle:**
  - No tokens or secrets in it.
  - The SDK e2e and the Claude run used separate deployments, so their readbacks don't mix.
  - The Claude run loaded `debrief` before its first write, uploaded via `curl -T`, and ended with `playedAs`, the alias, a guess-only thread, and no NPC for the Lantern Widow.

**Acceptance criteria still open (expected before merge):** no CI run is linked yet, the live deploy job hasn't run, and the "how to connect Claude Code to live" note isn't on the ticket yet.
