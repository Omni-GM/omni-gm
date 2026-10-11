# Cross-family review: Codex GPT-6.1 Sol (high reasoning), read-only

T3 delegated task `omnigm-36-review-r1`, run against PR #47 at commit
`28f1876` (the third headless run), with tickets #36 and #35 as the oracle.
Links to the reviewer's local paths are reduced to `file:line`. Result:

1. **Should-fix — convex/skills.ts:44: plank answers still have a contradictory story-state write path.** Line 42 says unseen background is "intent in the note, never story state," but line 44 allows "a confirmed plank answer" through `story_commit`. The delegated `plank-questions` procedure unconditionally instructs that write at lines 51–52. A main-plot background answer therefore becomes fixed story state despite the new guardrail. This concerns the contradictory instructions, not the deferred secret-record implementation.

2. **Should-fix — scripts/briefing-e2e.ts:374: the fixture summary changes the players' announced plan.** It seeds "the party will watch tonight," while the transcript:28 says, "Tomorrow we search the cellar, then we watch the weir at night." The entity update correctly preserves tomorrow night. The passing briefing repeats "The party watches tonight" in claude.jsonl:12, so the proof accepts a briefing that contradicts its source.

3. **Should-fix — scripts/verify-briefing.ts:241: the claim checks miss an actual unmarked NPC claim.** The passing briefing states that Ferrant "Has argued with Holloway over the weir gate for twenty years." Its source is explicitly **GM as Reeve Holloway**, not narration. Spec story 20 requires claims marked by who made them. The verifier checks only debt, haunting, downriver and key keywords, so this relationship claim escapes; the content review nevertheless says Holloway's words are marked "according to."

4. **Should-fix — scripts/verify-briefing.ts:266: the five-fact check discards unsourced facts before counting.** `.filter((u) => source.test(u))` means additional unsourced fact lines neither count toward the limit nor fail a sourcing assertion. Applying this exact check to the committed strong-start reply with two extra unsourced fact lines still produces five and passes. The secrets section has no corresponding fact-count or fact-sourcing check. This does not establish the section walk's "at most five sourced facts" contract.

5. **Should-fix — proof/briefing/headless-content-review.md:17: the claimed NPC completeness is absent from the conversation.** The review says NPCs give "what they want," but the briefing's Corwin and Sister Ulla entries provide no wants and flag no missing wants. Spec story 21 requires each NPC's wants; story 26 requires gaps shown as flags. "Not played yet" addresses Ulla's portrayal, not her missing motivation.

Overall verdict: Request changes; the procedure contradiction and headless proof gaps should be resolved before merge.
