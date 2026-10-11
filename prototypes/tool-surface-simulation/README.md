# PROTOTYPE: which MCP tool surface helps the AI most?

Throwaway. This folder lives only on the `prototype/tool-surface-simulation` branch and never merges to `main`.
It answers [Prototype: which MCP tool surface helps the AI most?](https://github.com/Omni-GM/omni-gm/issues/10).
All campaign data, transcripts, and names are invented.

## What it is

- `src/domain.ts`: an in-memory story-state store that enforces the spec's rules: allowed kinds, properties, and relationship types; every change needs a basis, a verbatim source, and why; a player guess or plan may only touch a thread or character goal; debrief changes are drafted, then committed; fixes outside a debrief are all-or-nothing commits with a reason.
- `src/surfaces.ts`: four MCP tool surfaces over that one store.
  - **A** few deep tools, a parameter picks the operation: `story_read`, `debrief`, `adventure`, `story_correct`, `schema_change`.
  - **B** many narrow verbs (21 tools), one change per draft call.
  - **C** narrow writes, a generic `find` and `get`, and a `skill` tool that lists and loads the procedures.
  - **D** C without `skill`; the procedures ride in the MCP server instructions.
- `src/procedures.ts`: the six server-provided procedures (map speakers, split scenes, debrief, frame talk, prep sparring, plank questions) and the standing rules.
- `src/server.ts`: the fake MCP server over stdio. `SURFACE` picks the surface. It logs every call and rejection, and serves a transcript upload endpoint: a signed URL, or a page behind sign-in (`UPLOAD_MODE=page`).
- `src/campaign.ts` and `fixtures/`: the invented campaign "The Lantern Coast" and three session transcripts.
- `src/tasks.ts`: the six tasks, each with the GM's prompt, a seed state, and gold checks.
- `src/run.ts`: drives headless Claude Code (`claude -p --model claude-sonnet-5-5`) and Codex (GPT-6.1 Sol) against the server, isolated from user settings, and scores each run into `results/runs/<client>-<surface>-<task>-<rep>/`.
- `src/scorecard.ts`: aggregates the runs into `results/scorecard.md`.

## Run it

```sh
pnpm install
bun scripts/smoke.ts                 # all four surfaces answer
bun src/run.ts --reps 3              # the matrix; finished runs are skipped
bun src/run.ts --tasks U-page --surfaces C
bun src/scorecard.ts
```

Codex needs a working local Codex config; the runner copies its model provider into a throwaway `CODEX_HOME` per run.
