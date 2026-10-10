// PROTOTYPE — D10: WorkOS AuthKit as the OAuth issuer for MCP clients (claude.ai, Claude Desktop connectors).
// To enable: set WORKOS_AUTHKIT_DOMAIN (https://<subdomain>.authkit.app) on the deployment, copy this file to
// convex/auth.config.ts, then run `pnpm exec convex run oauth:configure`. Convex refuses to deploy it while the var is unset.
const authkit = process.env.WORKOS_AUTHKIT_DOMAIN;

export default {
  providers: authkit
    ? [{ type: "customJwt" as const, issuer: authkit, algorithm: "RS256" as const, jwks: `${authkit}/oauth2/jwks` }]
    : [],
};
