# Coherence adoption proof

Coherence 1.7.2 runs from the project's dev dependency. The durable run and journal records are in `.coherence/runs` and `.coherence/journal`; the logs here are readable excerpts of them.

| Acceptance | Artifact |
| --- | --- |
| Hooks match what install writes for Claude Code and Codex | [hooks check](hooks-check.log) |
| Specs parse with 0 problems: 3 components, 5 invariants | [spec check](spec-check.log) |
| The vocabulary moved from GLOSSARY.md holds: 0 rejected names, 0 unknown nouns | [lexicon check](lexicon-check.log) |
| Each owner isolation oracle passed, went red when `campaignFor` read the first campaign instead of the caller's, and passed again batched and alone after the restore | [runs](run-status.log), [every run and refutation](runs.log) |
| The local gate | [pnpm check](check.log), all 104 tests |
| Scope's first reading | [Structure view](scope-structure.png) |

The owner isolation tests were green before the adoption; the red runs come only from the staged break, not from a failing history.

The one-at-a-time runs at 10:23:22 in [runs](runs.log) are an authoring error, not red evidence: `testMatch` expected an uncolored vitest summary. The tests passed alone; the pattern now tolerates color codes, and the run at 10:24:00 passes each test alone.
