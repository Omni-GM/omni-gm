import { register } from "convex-mcp-gateway/test";
import { convexTest } from "convex-test";
import { expect } from "vitest";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
export function createTest() {
  const t = convexTest(schema, modules);
  register(t);
  return t;
}
export function client(
  subject = "invented-gm",
  shared?: ReturnType<typeof createTest>,
) {
  const t = shared ?? createTest();
  const owner = t.withIdentity({ subject, issuer: "https://auth.example.com" });
  let session: string | null = null;
  let id = 0;
  async function rpc(method: string, params: Record<string, unknown> = {}) {
    const response = await owner.fetch("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(session ? { "Mcp-Session-Id": session } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    session = response.headers.get("Mcp-Session-Id") ?? session;
    const text = await response.text();
    const data =
      text.startsWith("event:") || text.startsWith("data:")
        ? text
            .split("\n")
            .find((l) => l.startsWith("data: "))
            ?.slice(6)
        : text;
    if (!data) throw new Error("Missing JSON-RPC response data");
    return JSON.parse(data);
  }
  async function call(name: string, args: Record<string, unknown> = {}) {
    const response = await rpc("tools/call", { name, arguments: args });
    if (response.error || response.result?.isError)
      throw new Error(JSON.stringify(response));
    expect(response.result.structuredContent).toBeDefined();
    return name === "get"
      ? (response.result.structuredContent.value ??
          response.result.structuredContent.items)
      : response.result.structuredContent;
  }
  return {
    t,
    owner,
    sessionId: () => session,
    borrowSession: (value: string | null) => {
      session = value;
    },
    rpc,
    call,
    async init() {
      return rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "proof", version: "1" },
      });
    },
  };
}
