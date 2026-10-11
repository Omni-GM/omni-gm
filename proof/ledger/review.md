# Cross-family review: GPT-6.1 Sol

Read-only adversarial review of `git diff origin/main...61267a8`, run as a T3 delegated task (provider `codex`, model `gpt-6.1-sol`, high reasoning). Oracle: ticket #16 and spec #11. The reviewer ran `pnpm check` (23 tests passed) and reported no blockers.

## Findings and dispositions

1. **Major: cumulative aliases make the Ledger projection grow quadratically** (`convex/debrief.ts`). Every alias update repeated the full alias list in `before` and `after`. The reviewer measured 150 updates of one 1,000-character alias at a 178 KB draft and a 22.6 MB projection, past Convex's 16 MiB return limit.
   **Fixed.** An update row now lists only the aliases that change adds, as `addAliases`, with no alias `before`. A row's size is now bounded by its own proposal. Red: [03-red-alias-growth.log](03-red-alias-growth.log). Green: [03-green-alias-growth.log](03-green-alias-growth.log).
2. **Major: the local host exposes an authenticated tool proxy on every interface** (`scripts/ledger-host.ts`). Anyone who could reach the port could call any tool, including `debrief_commit`, with the staging token.
   **Fixed.** The host binds to `127.0.0.1`, accepts `/host/mcp` only with a same-host `Host`, a same-origin or absent `Origin`, and `Content-Type: application/json`, and forwards only `tools/list`, `resources/read`, and `debrief_drop`. Proof: [host-guard.log](host-guard.log).
3. **Minor: a reload replays the startup draft, so dropped rows reappear.**
   **Fixed.** A successful `debrief_drop` through the host replaces the tool result the host renders. Proof: [after-reload-900.png](after-reload-900.png) shows six changes after a reload.
