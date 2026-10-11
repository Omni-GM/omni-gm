# Cross-family review: GPT-6.1 Sol

Read-only adversarial review of `origin/main...feat/upload-page` at `01854c8` (high reasoning effort), run as a T3 delegated task on Codex. Oracle: ticket #17 and spec #11. The reviewer ran `pnpm test` (25 passed) and left the tree clean.

## Findings and dispositions

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | Major | A failed code exchange loses the upload session. The callback URL has no `session`, and the page restored it only after a successful exchange. "Sign in again" then saved `session: null`. | Fixed. The page restores the session and cleans the URL before the exchange, on both `code` and `error` callbacks. [Browser check](review-fixes-browser.log): a bad code shows "The sign-in failed", the URL and script keep the session, and a real re-sign-in returns to the same session's drop zone. |
| 2 | Minor | A network failure during upload leaves the page on "Uploading" with no controls. | Fixed. `upload()` catches request failures and restores the drop zone with a retry message. [Browser check](review-fixes-browser.log) with `fetch` rejected shows the drop zone and "The upload did not reach the server". |
| 3 | Minor | A lock that lands between the page's check and the upload returns 500 (before the ticket) or 403 (after it) instead of 409. | Fixed. The page route maps a refused ticket and a refused store to 409, and a 409 makes the page reload the session's state. The interleavings are not reproducible through `convex-test`'s sequential HTTP seam, so no race test was added. The endpoint test now covers the deterministic lock: after `scenes_set`, GET reports `locked: true`, PUT returns 409, and the stored bytes are unchanged ([green-only](05-green-locked-page.log): the pre-check already existed). |

## Checked and found sound by the reviewer

- Campaign scoping on lookup and ticket issuance; finalization rechecks the lock atomically.
- OAuth with random state, S256 PKCE, and fixed client and redirect values. No auth bypass, cross-owner access, open redirect, or PUT CSRF.
- The inline config escapes `<`; filenames and messages use `textContent`. Tokens stay out of URLs.
- Tests drive MCP and HTTP routes without inspecting tables.
- Browser logs back the sign-in, the owner refusal, and the byte-exact store; the recorded hash matches the fixture.
- No secrets or real campaign material.
