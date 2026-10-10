# A remote store served over MCP is the single truth for story state

The story state, the debriefs that change it, and the adventure frame live only in a remote store that AI clients reach through an MCP server. The game master's session notes and prep stay in their own notes vault, which holds no mirrored copy of the state. The game master works beside their notes and from any AI client, including on the go without the vault, so one truth must be reachable everywhere and two copies must never disagree. Reading transcripts and drafting changes runs in the game master's AI client. The server only stores, validates, and keeps the change history, and it makes no AI calls of its own.

## Considered options

- **The notes vault as the truth, mirrored to a store.** Rejected: the state would be unreachable without the local vault, and a sync would keep two copies in step.
- **A dedicated app as the place to work.** Rejected for now: earlier prototypes that moved prep into their own app lost momentum next to the game master's existing notes.
- **Extraction on the server.** Rejected: transcripts are local files, and server-side AI adds cost and code before the debrief has proven useful.

## Consequences

- The debrief is proven first without any infrastructure, on a real transcript. The hosted store is built around what worked. An earlier hosted attempt stalled on deployment and migration before one prep loop closed.
- The first story state is seeded from the latest session only, so there is no migration of older records.
