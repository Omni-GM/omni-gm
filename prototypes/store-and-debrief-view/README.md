# PROTOTYPE: story-state store and draft-debrief view

Throwaway prototype for [Prototype: how should the store and the draft-debrief view be shaped?](https://github.com/Omni-GM/omni-gm/issues/8).
Not production code. All example data is invented.

- **Architecture brief:** open `index.html` in a browser. It has the decision cards.
- **Store:** `convex/` is a local Convex deployment with a thin MCP endpoint at `/mcp` (a Convex HTTP action).
- **Tool surface:** `convex/tools.ts`.
- **View:** `view/draft-debrief.html` is the MCP Apps resource `ui://omni-gm/draft-debrief`, with three variants.

## Run it

```sh
pnpm install
pnpm dev                                  # first run: CONVEX_AGENT_MODE=anonymous pnpm dev, picks a local deployment
pnpm exec convex env set MCP_TOKEN prototype-local-token
pnpm seed                                 # campaign, starter schema, session 1 committed
pnpm smoke                                # an MCP SDK client drafts the debrief of session 2 (leaves it as a draft)
pnpm view                                 # http://localhost:4600/?variant=A  (B, C) — use the floating bar or ← →
```

The MCP endpoint is `http://127.0.0.1:3211/mcp` with header `Authorization: Bearer prototype-local-token`.
To try it in Claude Code:

```sh
claude mcp add --transport http omni-gm-proto http://127.0.0.1:3211/mcp --header "Authorization: Bearer prototype-local-token"
```

`pnpm dev` runs `scripts/embed-view.ts` first, which inlines the view HTML into `convex/_view.ts`.
To wipe everything, delete the local deployment (`pnpm exec convex deployment` lists it) and seed again.
