# PROTOTYPE: story-state store and draft-debrief view

Throwaway prototype for [Prototype: how should the store and the draft-debrief view be shaped?](https://github.com/Omni-GM/omni-gm/issues/8).
Not production code. All example data is invented.

- **Architecture brief:** open `index.html` in a browser. It has the decision cards.
- **Store:** `convex/` is a Convex app. The MCP endpoint `/mcp` is the [`convex-mcp-gateway`](https://www.convex.dev/components/convex-mcp-gateway) component, with the four deep tools wrapping internal functions.
- **Tool surface:** `convex/tools.ts` (descriptions) and `convex/mcpTools.ts` (handlers).
- **View:** `view/draft-debrief.html` is the MCP Apps resource `ui://omni-gm/draft-debrief`, using the Ledger layout. Variants A and B are in commit f2c8d3b.

## Run it

```sh
pnpm install
pnpm dev                                  # first run: CONVEX_AGENT_MODE=anonymous pnpm dev, picks a local deployment
pnpm exec convex env set MCP_TOKEN prototype-local-token
pnpm seed                                 # wipes, then seeds: campaign, starter schema, session 1 committed
pnpm smoke                                # an MCP SDK client drafts the debrief of session 2 (leaves it as a draft)
pnpm view                                 # http://localhost:4600/ — a minimal MCP Apps host showing the Ledger
```

The MCP endpoint is `http://127.0.0.1:3211/mcp` with header `Authorization: Bearer prototype-local-token`.
Claude Code (tools only, no view):

```sh
claude mcp add --transport http omni-gm-proto http://127.0.0.1:3211/mcp --header "Authorization: Bearer prototype-local-token"
```

To see the view in Claude Desktop, bridge the header with `bunx mcp-remote http://127.0.0.1:3211/mcp --header "Authorization: Bearer prototype-local-token"` in its MCP config (D10).

`pnpm dev` runs `scripts/embed-view.ts` first, which inlines the view HTML into `convex/_view.ts`.
`pnpm seed` wipes the story-state tables before seeding.
