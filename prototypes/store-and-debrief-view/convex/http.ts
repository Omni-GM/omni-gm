// PROTOTYPE — throwaway. The MCP endpoint, mounted with convex-mcp-gateway (D1).
// D10: with WORKOS_AUTHKIT_DOMAIN set, Convex validates AuthKit JWTs (auth.config.ts), the gateway serves
// OAuth discovery and challenges anonymous requests. Without it, a static bearer token resolves to owner "local".
import { httpRouter } from "convex/server";
import { McpGateway, type McpAuthorizerHandler, type McpResourceAuthorizerHandler } from "convex-mcp-gateway";
import { components } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { tools, resources } from "./tools";

const gateway = new McpGateway(components.mcpGateway);

const usesAuthKit = Boolean(process.env.WORKOS_AUTHKIT_DOMAIN);

const staticTokenIdentity = async (token: string) =>
  process.env.MCP_TOKEN && token === process.env.MCP_TOKEN ? { subject: "local" } : null;

const authorize: McpAuthorizerHandler = async (_ctx, { identity }) =>
  identity ? { allowed: true } : { allowed: false, reason: "Unauthorized" };

const authorizeResource: McpResourceAuthorizerHandler = async (_ctx, args) =>
  "identity" in args && args.identity ? { allowed: true } : { allowed: false, reason: "Unauthorized" };

const mcp = httpAction(async (ctx, req) =>
  gateway.handleMcpRequest(ctx, req, {
    authorize,
    authorizeResource,
    resolveIdentity: usesAuthKit ? undefined : staticTokenIdentity,
    requireAuth: usesAuthKit,
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
http.route({
  path: "/.well-known/oauth-protected-resource/mcp",
  method: "GET",
  handler: httpAction(async (ctx, request) => gateway.serveProtectedResourceMetadata(ctx, request)),
});
export default http;
