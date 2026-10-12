# Reveals in the secret owner isolation invariant

`secret owner isolation` named only secret writes. Its oracle now also drafts and commits a reveal of the first owner's secret from a second owner: in the second owner's own debrief, next to a reveal of their own secret that the commit applies, and through the first owner's debrief. All data is invented.

The break used for every refutation below replaces the campaign-scoped lookup in `secretToReveal` (`convex/secrets.ts`) with a lookup by secret id across every campaign. Nothing of it was committed.

| Acceptance | Red | Green |
| --- | --- | --- |
| `coherence spec --check` names reveals under `secret owner isolation` | [spec before](01-red-spec.log): the sentence, `over:` and `via:` name only writes | [spec after](07-green-spec.log): "reveals" in the sentence, the oracle name and its `over:` line; 0 problems |
| The invariant catches a cross-owner reveal | [old oracle, break staged](02-red-refutation-missed.log): `coherence refute` reports the old oracle "still passed with the break staged, so nothing was refuted" | [refutation, break staged](03-red-refutation-witnessed.log): the new oracle went red and the refutation is recorded; [restored, every oracle batched and alone](06-green-run.log), [status](06-green-run-status.log) |
| A second owner can't draft or commit a reveal of the first owner's secret (MCP endpoint) | [vitest, break staged](04-red-cross-owner-reveal.log): the second owner's debrief commit turns the first owner's secret `revealed` | [vitest, restored](05-green-cross-owner-reveal.log) |
| The local gate | | [pnpm check](check.log) on the tree merged with `main`, all 110 tests |
| Cross-family review | | [dispositions](review-dispositions.md) |

The reveal path was already scoped before this change, so the extended oracle passes on the unbroken tree from the start. The red evidence is the gap: the old oracle missed the staged break, and the new one catches it. The durable run and refutation records are in `.coherence/runs/22c68aa9-63fa-4794-b65f-b0a24894758c.jsonl`.
