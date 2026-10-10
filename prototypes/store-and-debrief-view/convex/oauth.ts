// PROTOTYPE — D10: points the gateway's OAuth discovery at WorkOS AuthKit. Run once per deployment:
//   pnpm exec convex run oauth:configure
import { internalMutation } from "./_generated/server";
import { McpGateway } from "convex-mcp-gateway";
import { components } from "./_generated/api";

export const configure = internalMutation({
  args: {},
  handler: async (ctx) => {
    const authServerUrl = process.env.WORKOS_AUTHKIT_DOMAIN;
    if (!authServerUrl) throw new Error("Set WORKOS_AUTHKIT_DOMAIN first.");
    await new McpGateway(components.mcpGateway).setOAuthConfig(ctx, { authServerUrl });
  },
});
