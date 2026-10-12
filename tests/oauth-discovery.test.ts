import { selectResourceURL } from "@modelcontextprotocol/sdk/client/auth.js";
import { afterEach, expect, test, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import { createTest } from "./mcp-client";

const site = "https://some.convex.site";
const documentedUrl = `${site}/mcp`;

afterEach(() => {
  vi.unstubAllEnvs();
});

async function configuredDeployment() {
  vi.stubEnv("WORKOS_AUTHKIT_DOMAIN", "https://authkit.example.com");
  vi.stubEnv("CONVEX_SITE_URL", site);
  const t = createTest();
  await t.mutation(internal.oauth.configure, {});
  return t;
}

async function discoverMetadata(
  t: ReturnType<typeof createTest>,
  registeredUrl: string,
) {
  const challenge = await t.fetch(new URL(registeredUrl).pathname, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
  });
  expect(challenge.status).toBe(401);
  const metadataUrl = challenge.headers
    .get("www-authenticate")
    ?.match(/resource_metadata="([^"]+)"/)?.[1];
  expect(metadataUrl).toBe(`${site}/.well-known/oauth-protected-resource/mcp`);
  const metadata = await t.fetch(new URL(String(metadataUrl)).pathname);
  expect(metadata.status).toBe(200);
  return metadata.json();
}

test("an MCP client registered at /mcp or /mcp/ accepts the documented /mcp resource", async () => {
  const t = await configuredDeployment();
  for (const registeredUrl of [documentedUrl, `${documentedUrl}/`]) {
    const metadata = await discoverMetadata(t, registeredUrl);
    expect(metadata.resource).toBe(documentedUrl);
    const resource = await selectResourceURL(
      registeredUrl,
      {} as Parameters<typeof selectResourceURL>[1],
      metadata,
    );
    expect(resource?.href).toBe(documentedUrl);
  }
});
