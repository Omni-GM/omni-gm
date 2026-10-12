# Omni-GM

A game master's companion: a store served over MCP that keeps story state, debriefs and prep, and makes no AI calls of its own.

## trust levels
- game master (outside): a caller signed in through WorkOS AuthKit, an AI client over MCP or a browser on the upload page, acting for one game master; its identity is verified, its input is not
- upload URL holder (outside): whoever holds a signed transcript upload URL; the single-use token alone admits the bytes
- visitor (outside): anyone on the internet before sign-in
- operator: a developer running the project's scripts: the end-to-end walks and verifications sign in as an invented game master with OMNI_GM_ACCESS_TOKEN, and only codegen and deploy use a deploy key
- campaign store: the Convex tables, where every record belongs to one game master's campaign

## invariants
