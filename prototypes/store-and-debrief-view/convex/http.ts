// PROTOTYPE — throwaway. The MCP endpoint, mounted with convex-mcp-gateway (D1).
// Now: a static bearer token resolves to owner "local". Later: Convex auth (auth.config.ts, e.g. WorkOS)
// validates the OAuth token and ctx.auth.getUserIdentity() yields the owner; drop resolveIdentity.
import { httpRouter } from "convex/server";
import { McpGateway, type McpAuthorizerHandler, type McpResourceAuthorizerHandler } from "convex-mcp-gateway";
import { components } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { tools, resources } from "./tools";

const gateway = new McpGateway(components.mcpGateway);

const resolveIdentity = async (token: string) =>
  process.env.MCP_TOKEN && token === process.env.MCP_TOKEN ? { subject: "local" } : null;

const authorize: McpAuthorizerHandler = async (_ctx, { identity }) =>
  identity ? { allowed: true } : { allowed: false, reason: "Unauthorized" };

const authorizeResource: McpResourceAuthorizerHandler = async (_ctx, args) =>
  "identity" in args && args.identity ? { allowed: true } : { allowed: false, reason: "Unauthorized" };

const mcp = httpAction(async (ctx, req) =>
  gateway.handleMcpRequest(ctx, req, {
    authorize,
    authorizeResource,
    resolveIdentity,
    tools,
    resources,
    serverInfo: { name: "omni-gm-store-prototype", version: "0.0.0" },
  }),
);

const http = httpRouter();
for (const path of ["/mcp/", "/mcp"]) {
  http.route({ path, method: "POST", handler: mcp });
  http.route({ path, method: "GET", handler: mcp });
  http.route({ path, method: "DELETE", handler: mcp });
}
export default http;
