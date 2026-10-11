**Verdict: I approve the fixes at 8d4a87c.** I found no remaining blockers and no required follow-ups.

I read the ticket body, the original spec and brief, both round-one review reports and the dispositions. Then I checked the diff from 67e96ca to 8d4a87c against them. I made no edits and ran nothing against the live deployment.

**Fix 1: add, drop and commit now name the stale draft change and say how to repair it**
- A new helper in `convex/debrief.ts` (around line 271) is the only path that replays stored draft changes. Add, drop and commit all go through it.
  - Each failure now becomes `Pending change <id> is no longer valid: <reason>. Use debrief_drop to remove it first.`
  - The original reason is kept inside the message. That is why the hosted SDK's existing `/Allowed properties/` assertion on commit still matches.
- Drop now collects every invalid remaining change with its reason. Before, it labelled every failure a "dependent".
  - It throws before the `patch`, so a refused drop leaves the draft unchanged. The endpoint test asserts this with a before/after `get`.
- Commit still replays every change before any insert, so the batch stays atomic.
- The red log shows the old bare `Allowed properties…` error. The green log and the SDK run both assert `Pending change c1.*debrief_drop` and `invalid remaining changes: c1`.

**Fix 2: lastTime survives 200 newer schema commits**
- `commits.by_campaign_and_kind` is declared in `convex/schema.ts:62`. `kind` is a required field, so the index covers every row, old ones included.
- The deploy log shows Convex added the index on original-wolf-909, which covers existing campaigns.
- `convex/store.ts:166` takes `.first()` in descending order. That is the latest debrief, independent of the 200-commit window.
- The red/green pair reproduces the bug (`''` against the expected text) and the fix. The test confirms all 200 returned commits are schema commits, so it really exercises the gap.

**Proof:** `check.log` shows the full gate passing, 30 of 30 tests. Both schema SDK runs and the existing SDK suite pass on original-wolf-909, and the deploy log names the same target.

**Dispositions:** all four rejections hold against the ticket and spec.
- **Keeping new submissions out while the draft is invalid:** the error now names the repair, and auto-pruning would silently change a draft the game master already reviewed.
- **Compact overview:** the actual `lastTime` bug is fixed. Changing the overview contract is outside this ticket.
- **Live descriptions:** the ticket asks for immediate use, retirement, and the reason in history. Descriptions already stay in the commit history.
- **Automatic starter-schema propagation:** doing it silently would contradict the "only on explicit request" rule. The PR's risk callout already declares it.

**Optional nits, none blocking:**
1. `tests/mcp.test.ts`, the commit assertion in the new test (about line 1283), checks only for `"debrief_drop"`. It could also pin `"Pending change c1"`. All three paths share the helper, so the risk is low.
2. The drop error repeats "Use debrief_drop to remove it first" inside a drop error. It is still correct, because the client should add `c1` to the same drop call, but the wording is a little awkward.
