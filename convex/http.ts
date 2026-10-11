import { httpRouter } from "convex/server";
import { McpGateway } from "convex-mcp-gateway";
import { components } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { instructions } from "./skills";
import { tools } from "./tools";
import { client, page } from "./uploadPage";
import { download, pageSessionApi, upload } from "./uploads";

const gateway = new McpGateway(components.mcpGateway);
const mcp = httpAction((ctx, req) =>
  gateway.handleMcpRequest(ctx, req, {
    requireAuth: true,
    authorize: async (_ctx, { identity }) =>
      identity ? { allowed: true } : { allowed: false, reason: "Unauthorized" },
    tools,
    initializeInstructions: instructions,
    serverInfo: { name: "omni-gm", version: "0.1.0" },
  }),
);
const http = httpRouter();
for (const path of ["/mcp", "/mcp/"]) {
  for (const method of ["POST", "GET", "DELETE"] as const)
    http.route({ path, method, handler: mcp });
}
for (const path of [
  "/.well-known/oauth-protected-resource/mcp",
  "/.well-known/oauth-protected-resource/mcp/",
]) {
  http.route({
    path,
    method: "GET",
    handler: httpAction((ctx, req) =>
      gateway.serveProtectedResourceMetadata(ctx, req),
    ),
  });
}
http.route({ path: "/upload", method: "PUT", handler: upload });
http.route({ path: "/upload", method: "POST", handler: upload });
http.route({ path: "/upload-page", method: "GET", handler: page });
http.route({
  path: "/upload-page/client.json",
  method: "GET",
  handler: client,
});
for (const method of ["GET", "PUT"] as const)
  http.route({ path: "/upload-page/session", method, handler: pageSessionApi });
http.route({ pathPrefix: "/transcripts/", method: "GET", handler: download });
export default http;
