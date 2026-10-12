# Scripts

The operator's tooling: end-to-end walks and real-client verifications run against a deployment, and the codegen and deploy steps.

## entrances
- e2e: the operator runs the end-to-end debrief walk against a deployment
  handler: e2e.ts
  trust: operator
- briefing e2e: the operator walks the briefing against a deployment
  handler: briefing-e2e.ts
  trust: operator
- checklist e2e: the operator walks the prep checklist against a deployment
  handler: checklist-e2e.ts
  trust: operator
- debrief briefing e2e: the operator walks a debrief that ends in its briefing
  handler: debrief-briefing-e2e.ts
  trust: operator
- e2e agent upload: the operator walks the agent's signed-URL transcript upload
  handler: e2e-agent-upload.ts
  trust: operator
- e2e long transcripts: the operator uploads long transcripts against a deployment
  handler: e2e-long-transcripts.ts
  trust: operator
- e2e transcript upgrade: the operator walks the transcript storage upgrade
  handler: e2e-transcript-upgrade.ts
  trust: operator
- frame e2e: the operator walks frame talk against a deployment
  handler: frame-e2e.ts
  trust: operator
- prep e2e: the operator walks prep against a deployment
  handler: prep-e2e.ts
  trust: operator
- reference sessions e2e: the operator walks reference sessions against a deployment
  handler: reference-sessions-e2e.ts
  trust: operator
- schema e2e: the operator walks a schema change against a deployment
  handler: schema-e2e.ts
  trust: operator
- session note e2e: the operator walks saving and resuming a session note
  handler: session-note-e2e.ts
  trust: operator
- transcript retirement e2e: the operator walks retiring old transcript generations
  handler: transcript-retirement-e2e.ts
  trust: operator
- upload page e2e: the operator walks the signed-in upload page
  handler: upload-page-e2e.ts
  trust: operator
- verify agent upload: the operator verifies an agent's upload with a real client
  handler: verify-agent-upload.ts
  trust: operator
- verify briefing: the operator verifies the briefing with a real client
  handler: verify-briefing.ts
  trust: operator
- verify claude: the operator verifies the MCP connection with Claude
  handler: verify-claude.ts
  trust: operator
- verify debrief briefing: the operator verifies a debrief's briefing with a real client
  handler: verify-debrief-briefing.ts
  trust: operator
- verify frame talk: the operator verifies frame talk with a real client
  handler: verify-frame-talk.ts
  trust: operator
- verify prep sparring: the operator verifies prep sparring with a real client
  handler: verify-prep-sparring.ts
  trust: operator
- verify secrets: the operator verifies secrets with a real client
  handler: verify-secrets.ts
  trust: operator

## invariants
