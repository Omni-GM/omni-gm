import { ConvexError, v } from "convex/values";
import { McpGateway } from "convex-mcp-gateway";
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";
export const configure = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const authServerUrl = process.env.WORKOS_AUTHKIT_DOMAIN;
    if (!authServerUrl)
      throw new ConvexError(
        "Set WORKOS_AUTHKIT_DOMAIN before configuring OAuth",
      );
    await new McpGateway(components.mcpGateway).setOAuthConfig(ctx, {
      authServerUrl,
    });
    return null;
  },
});
