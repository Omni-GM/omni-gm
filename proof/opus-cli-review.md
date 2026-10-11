# Review of ticket #13 (feat/debrief-slice vs origin/main)

I found **5 blockers** and **10 follow-ups**. I only read code and ran no tests, so each repro below is traced from the code. No secret values are quoted. The single-use upload tokens in `proof/claude.jsonl` are already redacted.

## Blockers

**B1. After a drop leaves a broken dependant, every later `debrief_add` call fails as a whole.**
- **Where:** `convex/debrief.ts:277-280`. The handler replays the existing draft (`state.apply(p, …)`) outside the try/catch that rejects new changes one by one.
- **Repro:**
  1. Call `debrief_add` with `[new npc tempKey "sera", update {entity:"$sera", properties:{status:"alive"}}]`.
  2. Drop `c1`.
  3. Call `debrief_add` with `[new npc tempKey "sera" …]`.
  4. The whole call fails with `Entity not found: $sera. Use find or an earlier $tempKey.` and nothing is kept.
- **Impact:**
  - It breaks the spec rule that invalid changes are "rejected one by one … keeps the others".
  - The error blames the new batch, not the stale draft entry.
  - The "drop or replace those" advice in the `debrief` skill (`convex/skills.ts`) and in the README can't work: a replacement can never be added before the stale dependant is dropped.
  - The existing test (`tests/mcp.test.ts`, "dropping a new entity…") only checks the commit path, so it misses this.
- **Fix:** either make `drop` refuse (or list the affected changes) when remaining changes stop replaying, or have `add` report stale draft changes instead of throwing.

**B2. `find` splits words with ASCII-only `\W`, which breaks non-English names.**
- **Where:** `convex/search.ts:56`, `.split(/\W+/)` with no `u` flag and no Unicode classes.
- **Repro:** `"Müller".toLowerCase().split(/\W+/)` gives `["m","ller"]`, and `"Sören"` gives `["s","ren"]`. Each piece is searched on its own: `ller` never matches the stored token `müller`, and the one-letter pieces only match by prefix, so results are noisy.
- **Impact:** the standing rule is "Write in the game master's language", and Michael writes German. Looking a name or alias up before creating it is how the store avoids duplicates (user story 33), and that lookup becomes unreliable.
- **Fix:** split with `/[^\p{L}\p{N}]+/u`, and add a test with an umlaut name.

**B3. The hosted proof did not run where the spec says, and isolation from live is not shown.**
- **Evidence:**
  - The spec says the SDK e2e runs on "the dev deployment of a second Convex project, `omni-gm-e2e`". `proof/sdk-e2e.log:2` shows a **preview of the `omni-gm` project** (`preview/feat-debrief-slice`, `limitless-flamingo-526`) instead.
  - The headless Claude run (`proof/claude.jsonl:26`) went to a **different** deployment, `resolute-owl-427`. No deploy log or README line says what that deployment is, so nothing shows it isn't live.
  - The README's "Develop and prove" section documents the preview flow, which contradicts the spec's two-deployment design and ADR 0001's amended setup.
- **Impact:** the acceptance item "SDK e2e on the e2e deployment" is not met as written. The rule "a branch never touches the live deployment" can't be checked for the Claude run.
- **Fix:** run both proofs against `omni-gm-e2e`, log the deploy and the URL for each, and make the README match.

**B4. The e2e script only passes on a brand-new campaign.**
- **Where:** `scripts/e2e.ts:217` (`found.hits.length === 1`), `:235` (`history[0].session === session.id`), `:246`. The same pattern is in `scripts/verify-claude.ts:100`.
- **Repro:** run `pnpm e2e` twice against one deployment with the same M2M subject. One owner has one campaign, so the second run creates a second "Sera Venn". `find "Sarah Ven"` then returns 2 hits and the assertion fails.
- **Impact:** the spec's e2e deployment is long-lived and its M2M subject owns a fixed campaign. A new preview hid this problem. The next ticket's proof will fail.
- **Fix:** scope the assertions to the run, for example a unique name per run, filtering hits by this run's `commit` or session, or an e2e-only reset.

**B5. Gaps in the acceptance evidence.**
- **Wrong log staged:** the staged copy of `proof/06-green-search.log` (git status `AM`) is a **failing** run (1 failed of 10, command `-t 'find returns both'`). The working-tree copy passes, but it is a later full run (12:03:02, 11 tests, after step 08), not the step-06 green.
- **No red log for the rules:** `proof/05-red-rules.log` does not exist. The acceptance asks for red then green covering each server rule, and the rules test has no red evidence.
- **Test claims a case it doesn't run:** `tests/mcp.test.ts:415` says the other owner "cannot borrow an MCP session", but no request sends the first client's `Mcp-Session-Id` under the other identity. The other owner's `debrief_add`, `debrief_commit`, `scenes_set` and a search-mode `find` aren't tested either.
- **No CI run linked:** nothing in the repo or `proof/` links a CI run. The acceptance requires one.

## Follow-ups

1. **Source hits merge per entity** (`convex/search.ts:147-153`, keyed `source:entity:<entityIds[0]>`).
   - Two history rows for one NPC, one `npc_said` and one `rumor`, both containing "bridge", come back as one hit. It shows only the last row's basis and snippet.
   - Sources from a relationship only point to its `from` end.
   - This works against "a claim shows its basis".
2. **Every `finish` error becomes 403 "Expired, used or locked URL"** (`convex/uploads.ts:136-143`).
   - Repro: one timestamped line followed by about 600 KB of lines without timestamps. It parses into one utterance, and `text` plus `searchText` (`:72`) exceed Convex's 1 MiB document limit.
   - The client is told the URL expired, but the token is still valid because the mutation rolled back.
3. **Overview doesn't match the README.**
   - Adventures and commits use ascending `take(200)` (`convex/store.ts:155-163`), so they return the *oldest* 200, while the README says "recent".
   - `lastTime` (`:178`) comes from the newest-*created* committed session, not the most recently committed one as the README says.
4. **Scene windows overlap at the edges.** When a scene has no explicit end, `get scene:` uses `.lte("seconds", end)` with `end` set to the next scene's start (`convex/store.ts:286-293`). The next scene's first utterance then shows up in both scenes. `scenes_set` also allows `prev.end == next.start`.
5. **Wrong `debrief_drop` description** (`convex/tools.ts:61`): it says "Drop rejected changes", but rejected changes never enter the draft. This steers the model wrongly.
6. **`find` has no cap on query words.** Each word runs up to four searches with `take(200)`, so a long query can hit Convex read limits. Cap it at about 16 words.
7. **Expired upload tickets are never deleted** (`uploads` table).
8. **`verify-claude.ts:57-63` only scans assistant text.** It doesn't check `tool_use` inputs for transcript content, though the spec says "the file never goes through a tool call".
9. **The gate never type-checks `convex/` the way it runs.** Codegen runs with `--typecheck disable`, and the root `tsc` checks `convex/` with Node and Vite types (root `tsconfig.json`). `convex/tsconfig.json` is never used by the gate, so Node-only APIs in Convex code wouldn't be caught.
10. **Two smaller points:**
    - `session:<ordinal>` fails because `sessionFor` gets the prefixed ref and runs `replace(/^s/)` on it (`convex/store.ts:36`), while `debrief:2` works.
    - Check the 2,000-utterance cap against the line count of a real 3–4 hour transcript before Michael's prep.

## Checked with no defect found

- **Owner scoping:** every read and write goes through `campaignFor` and `sessionFor`, with a campaign check, search filters on `campaign`, and owner checks on download.
- **Single-use uploads under races:** the `valid` precheck, then store, then the serializable `finish`. The losing upload deletes its blob and gets 403.
- **Locking:** the transcript is locked once scenes or changes exist.
- **Atomic commit:** state, history and the commit row are written in one mutation, and a failed replay leaves nothing behind.
- **Guess rule:** checked on both relationship endpoints, and mixed bases are allowed.
- **Lookups:** schema and skill lookups can't borrow `Object.prototype` names.
- **Server instructions and skills:** instructions stay under 4,096 characters, and every procedure ends with the standing rules.
- **Tool output:** every tool declares `returns`, so clients get `structuredContent`.
- **Deploy job:** `deploy-main` only runs on pushes to `main`.
