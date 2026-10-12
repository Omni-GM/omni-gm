# Protected resource metadata names the documented /mcp URL proof

No campaign data is used. The HTTP routes are the seam for the metadata; Claude
Code against a branch preview is the seam for sign-in.

## Endpoint proof

`tests/oauth-discovery.test.ts` configures OAuth as a deploy does
(`oauth:configure`), sends an anonymous `initialize` to `/mcp` and to `/mcp/`,
follows the `resource_metadata` link in the 401 challenge, and hands the
metadata to the MCP SDK's `selectResourceURL`, the check Claude Code runs.

- `01-red-resource.log`: the test on the branch before the fix. The metadata
  names `https://some.convex.site/mcp/` instead of the documented
  `https://some.convex.site/mcp`.
- `01-green-resource.log`: the same test passes after `oauth:configure` sets the
  gateway's `resourceUrl` override to `<CONVEX_SITE_URL>/mcp`. Both
  registrations get the documented resource and the SDK accepts it.
- `check.log`: the full gate (`pnpm check`), 110 of 110 tests.
- `coherence.log`: `coherence spec --check` and `coherence run`, 5 of 5 pass.

## Claude Code proof

`claude-code-walk.sh` runs Claude Code 2.1.296 with a throwaway
`CLAUDE_CONFIG_DIR`. For `<site>/mcp` and `<site>/mcp/` it runs
`claude mcp add --transport http omni-gm <url>`, `claude mcp list` and
`claude mcp remove omni-gm`.

- `02-red-claude-code.log`: a preview of unchanged `main`
  (`base-preview-deploy.log`). The documented `/mcp` URL fails with
  "Protected resource … does not match expected …". Only `/mcp/` reaches
  "Needs authentication".
- `02-green-claude-code.log`: a preview of this branch (`preview-deploy.log`).
  Both URLs reach "Needs authentication".
- `metadata.log`: the preview's 401 challenge and the metadata on both
  well-known paths, each naming `<site>/mcp`.
