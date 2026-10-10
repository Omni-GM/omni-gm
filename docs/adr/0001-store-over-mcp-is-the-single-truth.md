# A store served over MCP is the single truth for story state

The story state, the debriefs that change it, and the adventure frame live only in one store that AI clients reach through our own MCP server. The game master's session notes and prep stay in their own notes vault, which holds no mirrored copy of the state. The game master works beside their notes and, later, from any AI client without the vault, so one truth must be reachable from every client and two copies must never disagree. Reading transcripts and drafting changes runs in the game master's AI client. The server only stores, validates, and keeps the change history, and it makes no AI calls of its own.

The store runs on a hosted Convex development deployment from the start. Its MCP endpoint is the `convex-mcp-gateway` Convex component, which exposes our own domain tools and leaves every other function internal. Clients sign in through WorkOS AuthKit with OAuth, because only an MCP Apps host such as claude.ai or Claude Desktop renders the draft-debrief view, and their connectors accept OAuth but not a custom token header. Moving to a production deployment later is a snapshot import that keeps every record's identity, so it needs no migration.

_Amended 2026-10-10 by [the store and draft-debrief view prototype](https://github.com/Omni-GM/omni-gm/issues/8). It originally said the store starts on a local deployment with a static token._

## Considered options

- **The notes vault as the truth, mirrored to a store.** Rejected: the state would be unreachable without the local vault, and a sync would keep two copies in step.
- **A dedicated app as the place to work.** Rejected for now: earlier prototypes that moved prep into their own app lost momentum next to the game master's existing notes.
- **Local first, hosted later.** First chosen, then dropped after the store prototype: a hosted development deployment costs one login, leaves nothing to move later, and gives MCP Apps hosts the public URL they need. An earlier hosted attempt stalled on deployment and migration; the gateway component and a hosted development deployment remove both.
- **A static token before real authentication.** Rejected: MCP Apps hosts cannot send it, so the draft-debrief view would need a local bridge on every machine.
- **A hand-written MCP endpoint.** Rejected: the gateway component already handles sessions, OAuth discovery, authorization, and an audit log.
- **Convex's own developer MCP server instead of our own.** Rejected: it gives the AI admin access to every function and no domain tools whose descriptions steer it.
- **Local SQLite.** Rejected: moving to hosted later would need a migration.
- **Extraction on the server.** Rejected: transcripts are local files, and server-side AI adds cost and code before the debrief has proven useful.

## Consequences

- The debrief is proven first without any infrastructure, on a real transcript. The store is built around what worked.
- The first story state is seeded from the latest session only, so there is no migration of older records.
