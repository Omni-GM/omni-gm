import type { McpResourceProvider } from "convex-mcp-gateway";
import { ledgerHtml } from "./ledgerHtml.generated";

export const ledgerUri = "ui://omni-gm/draft-debrief";
export const carriesLedger = { ui: { resourceUri: ledgerUri } };
const mimeType = "text/html;profile=mcp-app";

export const ledgerView: McpResourceProvider = {
  name: "ledger",
  list: async () => [
    {
      uri: ledgerUri,
      name: "draft-debrief",
      title: "Ledger view",
      description:
        "Review a draft debrief grouped by scene and drop wrong changes.",
      mimeType,
    },
  ],
  read: async (_ctx, { uri }) =>
    uri === ledgerUri ? [{ uri, mimeType, text: ledgerHtml }] : null,
};
