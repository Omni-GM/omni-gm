# Codegen without ripgrep, and the v1 prep-sparring retirement

Invented data only. This box has no `rg` binary on `PATH`. Each log shows
`command -v rg` failing in a clean `env -i` shell before it runs codegen.

## Script seam: `scripts/codegen.sh`

`tests/codegen.test.ts` copies the script into a sandbox project and runs it
with a `PATH` that holds only `bash`, `mkdir`, `rm`, `cp`, `ln`, `dirname`,
`grep` and a stub `pnpm` at the process boundary. No `rg` is on that `PATH`.

- [01-red-codegen.log](01-red-codegen.log): main's script refuses an
  anonymous `.codegen/.env.local` with `rg: command not found`. The refusal
  of a non-anonymous deployment is green-only: without `rg`, `! rg` is true,
  so main refused it for the wrong reason.
- [01-green-codegen.log](01-green-codegen.log): with `grep -q`, the
  non-anonymous deployment is still refused before `pnpm` runs, and the
  anonymous deployment generates the types.

## Real script runs

- [02-red-real-codegen.log](02-red-real-codegen.log): main's script runs
  twice against a real anonymous local Convex deployment. The first run
  passes because `.codegen/.env.local` doesn't exist yet. The second run,
  which is every later `pnpm check`, fails at the guard.
- [02-green-real-codegen.log](02-green-real-codegen.log): this branch's
  script passes both runs, then refuses an invented non-anonymous
  `CONVEX_DEPLOYMENT` and exits 1.

## Repo seam: v1 prep sparring

This branch removes `scripts/verify-prep-sparring.ts`, `proof/prep-sparring/`,
the five `fixtures/prep-sparring-*.md` inputs, the script's `Scripts.spec.md`
entrance, and the `--seed-only` mode of `scripts/prep-e2e.ts`, which only
seeded that headless fixture. This search finds no reference outside the
append-only Coherence journal:

```sh
git grep -n -i "verify-prep-sparring\|proof/prep-sparring\|prep-sparring-start\|prep-sparring-.*-answer\|note-correction\|seed-only\|sparring fixture" -- . ':!.coherence/**'
```

The served `prep-sparring` procedure is the v2 section walk and stays.
`proof/checklist/` and `proof/session-note/` already hold its headless proof.

## Gate

[check.log](check.log) is `pnpm check` in a clean `env -i` shell without `rg`,
run after an earlier codegen left an anonymous `.codegen/.env.local` in place.
Biome, codegen, both TypeScript projects and all 111 tests pass, with no
skipped tests.
