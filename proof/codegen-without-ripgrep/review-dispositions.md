# Review dispositions

Round 1: Codex gpt-6.1-sol, reasoning effort high, read-only, as a T3
delegated task.

1. **Major, held and fixed.** `scripts/prep-e2e.ts` still stored Mira's want
   as a plank answer through `story_commit`, which is v1 behavior: v2 keeps
   unplayed background in the secret store through `secret_write`.
   `proof/secrets/` already proves that path. The script now records the
   same write as a correction of what the table saw, the `story_commit` path
   the v2 `plank-questions` procedure keeps. The quote, why, reason and PASS
   lines say so. Two runs on a fresh branch preview pass.
2. **Minor, held and fixed.** The stub `pnpm` in `tests/codegen.test.ts`
   wrote to an unquoted log path, so a `TMPDIR` with spaces broke the
   happy-path test. The path now arrives as the quoted `PNPM_CALLS`
   environment variable.
3. **Nit, held and fixed.** The documented repo-seam search matched the
   proof README itself. It now searches only the README, tests, scripts and
   fixtures.

The reviewer confirmed the retire-not-rewrite call: `proof/checklist/` and
`proof/session-note/` cover the section walk, and `tests/prep.test.ts`
keeps the old endpoint behaviors in every gate.
