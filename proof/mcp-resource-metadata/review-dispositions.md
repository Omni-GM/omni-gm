# Review dispositions

Codex gpt-6.1-sol, reasoning effort high, read-only, as a T3 delegated task.
Verdict: nothing blocks merge.

1. **Low, fixed.** `tests/oauth-discovery.test.ts` dropped the origin of the
   challenge's `resource_metadata` URL before fetching it, so a challenge that
   pointed at another deployment would still pass. The test now asserts the
   whole URL is `<site>/.well-known/oauth-protected-resource/mcp` before it
   fetches the metadata. `01-red-resource.log` and `01-green-resource.log` are
   recaptured with the stricter test.

The reviewer also confirmed, without a finding, that `CONVEX_SITE_URL` gives
each preview and the live deployment its own origin, that `/mcp/`
registrations stay compatible, and that a revert followed by
`oauth:configure` clears the stored override.
