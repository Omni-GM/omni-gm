# Recommendation (draft, numbers pending the full matrix)

## Surface

TBD after the matrix.

## Findings that hold regardless of the numbers

- **Codex does not show MCP server instructions to the model.** Asked to quote them, GPT-6.1 Sol answered "NONE". Claude Code shows them but cuts them at 4,096 characters, mid-procedure. Server instructions therefore cannot carry the procedures (surface D), and the standing rules must also live where both clients read them: tool descriptions and the procedures themselves.
- **MCP prompts are user-started.** Neither headless client fetched one in any run, so procedures served only as prompts (surfaces A and B) never reach the model on its own.
- **The server-side rules hold.** The guess rule, unknown properties, locked scenes after a commit, and all-or-nothing corrections rejected every bad write the clients tried.
