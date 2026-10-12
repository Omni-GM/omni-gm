# Convex

The Convex backend: the MCP tools, the upload page and the story-state store behind them, scoped to the signed-in game master.

## entrances
- route /mcp: a game master's AI client calls the domain tools over MCP
  handler: mcp in http.ts
  trust: game master
- route /.well-known/oauth-protected-resource/mcp: a client discovers how to sign in
  handler: protectedResourceMetadata in http.ts
  trust: visitor
  control: none — public OAuth discovery metadata that every client must read before sign-in; it reads no campaign record
- route /upload: the holder of a signed URL uploads a transcript file
  handler: upload in uploads.ts
  trust: upload URL holder
- route /upload-page: a browser loads the upload page
  handler: page in uploadPage.ts
  trust: visitor
  control: none — serves the same static page to everyone; sign-in and every read happen in later signed-in calls
- route /upload-page/client.json: AuthKit reads the upload page's OAuth client metadata
  handler: client in uploadPage.ts
  trust: visitor
  control: none — public OAuth client metadata AuthKit fetches by design; it reads no campaign record
- route /upload-page/token: the upload page exchanges its sign-in code for a token
  handler: token in uploadPage.ts
  trust: visitor
  control: none — forwards an authorization code and PKCE verifier to AuthKit, which decides; it reads no campaign record
- route /upload-page/session: a signed-in game master reads a session and starts its upload
  handler: pageSessionApi in uploads.ts
  trust: game master
- route /transcripts/: a signed-in game master downloads a stored transcript file
  handler: download in uploads.ts
  trust: game master

## invariants
- owner isolation: A game master reads, changes, uploads and downloads only their own campaign's sessions, debriefs, scenes, transcripts and entities.
  over: a second signed-in owner reusing the first owner's MCP transport session, calling find, get, transcript_upload_url, debrief_add, debrief_drop, debrief_commit and scenes_set and downloading the transcript, against the first owner's committed debrief
  via: another owner stays scoped when reusing an MCP transport session and cannot read, edit, upload or download the campaign
  because: game masters share one deployment, and one game master's table notes, unplayed plans and transcripts of their players must never reach another
  crossing: game master -> campaign store
  entrances: route /mcp, route /transcripts/
  kinds: read, storage, identity
  checklist: scoped-reads declared as owner isolation
  checklist: capability-authorization dismissed: AuthKit and the MCP gateway accept the bearer token; the only bounded credential the project issues is the upload URL, a separate concern
  checklist: encrypted-storage dismissed: no field is designated confidential at rest; Convex holds the records
  checklist: key-rotation-compatibility dismissed: the project encrypts nothing itself
  checklist: redaction dismissed: no export runs under a scrubbing policy
  checklist: input-validation dismissed: argument validators guard every tool; scoping is about whose records, not their shape
  checklist: canonical-encoding dismissed: the owner key is the AuthKit subject as given, with no normalization undertaken
  checklist: identity-continuity dismissed: a campaign belongs to one subject for life; there is no anonymous-to-identified succession
  checklist: revision-preservation dismissed: commit history is the debrief's concern, not scoping
  checklist: commit-ordered-effects dismissed: a scoped write issues no external effect; the server makes no AI calls
  checklist: durable-dispatch-intent dismissed: nothing is dispatched outside the transaction
  checklist: declared-target-coverage dismissed: no write fans out across targets
  checklist: completion-evidence dismissed: whose records a call reaches is decided inside the call; the upload expiry and cleanup it schedules act only on that owner's upload by its id
- secret owner isolation: A game master writes, changes, fixes, reveals and reads only their own secrets, about only their own entities and story commits.
  over: a second signed-in owner reading, changing, fixing and dropping the first owner's secret, drafting and committing a reveal of it in their own debrief and through the first owner's debrief, and linking a secret to the first owner's entity, and the first owner fixing their own secret from the second owner's story commit
  via: secret writes and reveals isolate owners and reject invalid or oversized input without recording a commit
  because: a secret is the game master's unplayed background, the one thing the players must not see; another owner reading or binding it would leak it
  crossing: game master -> campaign store
  entrances: route /mcp
  kinds: read, storage, identity
  checklist: scoped-reads declared as secret owner isolation
  checklist: capability-authorization dismissed: AuthKit and the MCP gateway accept the bearer token; the only bounded credential the project issues is the upload URL, a separate concern
  checklist: encrypted-storage dismissed: no field is designated confidential at rest; Convex holds the records
  checklist: key-rotation-compatibility dismissed: the project encrypts nothing itself
  checklist: redaction dismissed: no export runs under a scrubbing policy
  checklist: input-validation dismissed: argument validators guard every tool; scoping is about whose records, not their shape
  checklist: canonical-encoding dismissed: the owner key is the AuthKit subject as given, with no normalization undertaken
  checklist: identity-continuity dismissed: a campaign belongs to one subject for life; there is no anonymous-to-identified succession
  checklist: revision-preservation dismissed: commit history is the debrief's concern, not scoping
  checklist: commit-ordered-effects dismissed: a scoped write issues no external effect; the server makes no AI calls
  checklist: durable-dispatch-intent dismissed: nothing is dispatched outside the transaction
  checklist: declared-target-coverage dismissed: no write fans out across targets
  checklist: completion-evidence dismissed: whose records a call reaches is decided inside the call; the upload expiry and cleanup it schedules act only on that owner's upload by its id
- checklist owner isolation: A game master reads and replaces only their own prep checklist and its history.
  over: a second signed-in owner reading the first owner's checklist and its history, replacing it, and following a borrowed continuation
  via: another owner cannot see or overwrite the checklist, its history or a borrowed continuation
  because: the prep checklist carries the game master's own definitions in their words, and a borrowed cursor must not open someone else's history
  crossing: game master -> campaign store
  entrances: route /mcp
  kinds: read, storage, identity
  checklist: scoped-reads declared as checklist owner isolation
  checklist: capability-authorization dismissed: AuthKit and the MCP gateway accept the bearer token; the only bounded credential the project issues is the upload URL, a separate concern
  checklist: encrypted-storage dismissed: no field is designated confidential at rest; Convex holds the records
  checklist: key-rotation-compatibility dismissed: the project encrypts nothing itself
  checklist: redaction dismissed: no export runs under a scrubbing policy
  checklist: input-validation dismissed: argument validators guard every tool; scoping is about whose records, not their shape
  checklist: canonical-encoding dismissed: the owner key is the AuthKit subject as given, with no normalization undertaken
  checklist: identity-continuity dismissed: a campaign belongs to one subject for life; there is no anonymous-to-identified succession
  checklist: revision-preservation dismissed: commit history is the debrief's concern, not scoping
  checklist: commit-ordered-effects dismissed: a scoped write issues no external effect; the server makes no AI calls
  checklist: durable-dispatch-intent dismissed: nothing is dispatched outside the transaction
  checklist: declared-target-coverage dismissed: no write fans out across targets
  checklist: completion-evidence dismissed: whose records a call reaches is decided inside the call; the upload expiry and cleanup it schedules act only on that owner's upload by its id
- session note owner isolation: A game master reads and writes only their own session note, and the note's owner cannot be spoofed.
  over: a second signed-in owner reading, overwriting and claiming ownership of the first owner's session note
  via: another owner cannot read, overwrite or spoof the note's owner
  because: the session note holds the game master's prep picks for the next session, which their players must not reach through another account
  crossing: game master -> campaign store
  entrances: route /mcp
  kinds: read, storage, identity
  checklist: scoped-reads declared as session note owner isolation
  checklist: capability-authorization dismissed: AuthKit and the MCP gateway accept the bearer token; the only bounded credential the project issues is the upload URL, a separate concern
  checklist: encrypted-storage dismissed: no field is designated confidential at rest; Convex holds the records
  checklist: key-rotation-compatibility dismissed: the project encrypts nothing itself
  checklist: redaction dismissed: no export runs under a scrubbing policy
  checklist: input-validation dismissed: argument validators guard every tool; scoping is about whose records, not their shape
  checklist: canonical-encoding dismissed: the owner key is the AuthKit subject as given, with no normalization undertaken
  checklist: identity-continuity dismissed: a campaign belongs to one subject for life; there is no anonymous-to-identified succession
  checklist: revision-preservation dismissed: commit history is the debrief's concern, not scoping
  checklist: commit-ordered-effects dismissed: a scoped write issues no external effect; the server makes no AI calls
  checklist: durable-dispatch-intent dismissed: nothing is dispatched outside the transaction
  checklist: declared-target-coverage dismissed: no write fans out across targets
  checklist: completion-evidence dismissed: whose records a call reaches is decided inside the call; the upload expiry and cleanup it schedules act only on that owner's upload by its id
- upload page owner isolation: The upload page serves and accepts a transcript only for a signed-in owner's own session.
  over: an anonymous visitor and a second signed-in owner reading and uploading to the first owner's session through the upload page
  via: the upload page refuses anonymous visitors and sessions of another owner, and stores the owner's file byte-exact
  because: the upload page is the one browser path into the store, and a transcript is the verbatim record of the owner's table
  crossing: game master -> campaign store
  entrances: route /upload-page/session
  kinds: read, storage, identity
  checklist: scoped-reads declared as upload page owner isolation
  checklist: capability-authorization dismissed: AuthKit and the MCP gateway accept the bearer token; the only bounded credential the project issues is the upload URL, a separate concern
  checklist: encrypted-storage dismissed: no field is designated confidential at rest; Convex holds the records
  checklist: key-rotation-compatibility dismissed: the project encrypts nothing itself
  checklist: redaction dismissed: no export runs under a scrubbing policy
  checklist: input-validation dismissed: argument validators guard every tool; scoping is about whose records, not their shape
  checklist: canonical-encoding dismissed: the owner key is the AuthKit subject as given, with no normalization undertaken
  checklist: identity-continuity dismissed: a campaign belongs to one subject for life; there is no anonymous-to-identified succession
  checklist: revision-preservation dismissed: commit history is the debrief's concern, not scoping
  checklist: commit-ordered-effects dismissed: a scoped write issues no external effect; the server makes no AI calls
  checklist: durable-dispatch-intent dismissed: nothing is dispatched outside the transaction
  checklist: declared-target-coverage dismissed: no write fans out across targets
  checklist: completion-evidence dismissed: whose records a call reaches is decided inside the call; the upload expiry and cleanup it schedules act only on that owner's upload by its id
