# Deliberate schema changes, ticket #18

The oracle is issue #18 and the schema_change contract in spec #11.
All campaign material here is invented. The MCP endpoint tests drive the
HTTP gateway inside convex-test, then read back with get/find. The hosted
proof uses the official MCP SDK, a per-branch preview and staging M2M sign-in.
No branch proof deploys to live.

## Red and green

Each red log was captured before implementing that behavior. Assertions
were retained for green. Focused runs skip unrelated tests by test-name
filter; check.log runs the complete suite with no skipped tests.

- red-add.log / green-add.log: property addition, immediate use, reason and
  operation with before/after definitions in the same commit history.
- red-retire.log / green-retire.log: retirement blocks new entities, updates
  and pending commits, keeps stored values and history, permits other updates.
- red-relationship.log / green-relationship.log: new relationship type works
  with its labels, inverse label and endpoint restrictions.
- red-reuse.log / green-reuse.log: a retired key cannot be repurposed.
- red-invalid.log / green-invalid.log: invalid definitions roll back the
  entire batch; prototype and reserved identifiers are rejected. Some checks
  in this table already passed; the red witness is the reserved name.
- red-size.log / green-size.log: oversized changes leave no definitions or
  history behind.
- Owner isolation and enum/number validation were green-only coverage of
  the existing rule applied to campaign definitions. No red was fabricated.

## Hosted proof

preview-deploy.log identifies the branch preview. sdk-e2e.log demonstrates
immediate property and relationship use, validation, retirement of a pending
write, preserved old values and history, recorded reasons/operations, and
atomic invalid-batch rejection. scripts/schema-e2e.ts is repeatable on the
same preview using unique schema identifiers.

## Gate and review

check.log is the full local pnpm check gate. Review artifacts and findings'
dispositions accompany the final reviewed commit. GitHub CI and deploy-main
links are recorded in the ticket resolution comment.

GPT-6.1 Sol wrote the implementation in T3 Code through the Codex harness.
