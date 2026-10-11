import type { AuthConfig } from "convex/server";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} on this deployment`);
  return value;
}
const issuer = required("WORKOS_AUTHKIT_DOMAIN");
export default {
  providers: [
    {
      type: "customJwt",
      issuer,
      algorithm: "RS256",
      jwks: `${issuer}/oauth2/jwks`,
      applicationID: required("WORKOS_CLIENT_ID"),
    },
  ],
} satisfies AuthConfig;
