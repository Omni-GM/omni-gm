// PROTOTYPE — throwaway. A stateless MCP endpoint (Streamable HTTP, JSON responses) as a Convex HTTP action.
// Local: http://127.0.0.1:3211/mcp with a static bearer token. Hosted: same code, the token check becomes
// an OAuth access-token check that yields the owner id.
import { httpRouter } from "convex/server";
import { httpAction, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { tools, DEBRIEF_VIEW_URI } from "./tools";
import { DEBRIEF_VIEW_HTML } from "./_view";

type Rpc = { jsonrpc: "2.0"; id?: string | number; method: string; params?: any };

async function ownerFromRequest(request: Request): Promise<string | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  return token && token === process.env.MCP_TOKEN ? "local" : null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const textResult = (value: unknown, extra: Record<string, unknown> = {}) => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  structuredContent: value,
  ...extra,
});

async function callTool(ctx: ActionCtx, ownerId: string, name: string, args: any) {
  const campaign = await ctx.runQuery(internal.store.campaignForOwner, { ownerId });
  if (!campaign) throw new Error("No campaign yet. Run the seed.");
  const campaignId = campaign._id;
  switch (name) {
    case "story_structure":
      return textResult(await ctx.runQuery(internal.store.structure, { campaignId }));
    case "story_schema":
      return textResult(await ctx.runQuery(internal.store.describeSchema, { campaignId }));
    case "story_find":
      return textResult(await ctx.runQuery(internal.store.findEntities, { campaignId, ...args }));
    case "story_entity": {
      const entityId = args.entityId as Id<"entities">;
      const tip = await ctx.runQuery(internal.store.entityTip, { entityId });
      const history = args.withHistory ? await ctx.runQuery(internal.store.entityHistory, { entityId }) : undefined;
      return textResult({ ...tip, history });
    }
    case "session_create":
      return textResult({ sessionId: await ctx.runMutation(internal.store.createSession, { campaignId, ...args }) });
    case "debrief_start":
      return textResult({ debriefId: await ctx.runMutation(internal.store.startDebrief, args) });
    case "debrief_propose":
      return textResult({ results: await ctx.runMutation(internal.store.proposeChanges, args) });
    case "debrief_drop":
      await ctx.runMutation(internal.store.dropChange, args);
      return textResult({ dropped: args.changeId });
    case "debrief_show":
      return textResult(await ctx.runQuery(internal.store.showDraft, args), {
        _meta: { ui: { resourceUri: DEBRIEF_VIEW_URI } },
      });
    case "debrief_commit":
      return textResult(await ctx.runMutation(internal.store.commitDebrief, args));
    case "story_correct":
      return textResult(await ctx.runMutation(internal.store.commitCorrection, { campaignId, ...args }));
    case "schema_change":
      return textResult(await ctx.runMutation(internal.store.changeSchema, { campaignId, ...args }));
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

async function handle(ctx: ActionCtx, ownerId: string, rpc: Rpc) {
  switch (rpc.method) {
    case "initialize":
      return {
        protocolVersion: rpc.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "omni-gm-store-prototype", version: "0.0.0" },
        instructions:
          "Omni-GM story-state store. The story state records what happened at the table, not plans. Debrief flow: story_structure → story_schema → session_create → debrief_start → debrief_propose → debrief_show → fix with the GM → debrief_commit.",
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools };
    case "tools/call":
      try {
        return await callTool(ctx, ownerId, rpc.params.name, rpc.params.arguments ?? {});
      } catch (error) {
        return { content: [{ type: "text", text: (error as Error).message }], isError: true };
      }
    case "resources/list":
      return { resources: [{ uri: DEBRIEF_VIEW_URI, name: "Draft debrief", mimeType: "text/html;profile=mcp-app" }] };
    case "resources/read":
      if (rpc.params?.uri !== DEBRIEF_VIEW_URI) throw new Error(`Unknown resource ${rpc.params?.uri}`);
      return { contents: [{ uri: DEBRIEF_VIEW_URI, mimeType: "text/html;profile=mcp-app", text: DEBRIEF_VIEW_HTML }] };
    default:
      throw Object.assign(new Error(`Method not found: ${rpc.method}`), { code: -32601 });
  }
}

const mcp = httpAction(async (ctx, request) => {
  const ownerId = await ownerFromRequest(request);
  if (!ownerId) return json({ error: "unauthorized" }, 401);
  const rpc = (await request.json()) as Rpc;
  if (rpc.id === undefined) return new Response(null, { status: 202 });
  try {
    return json({ jsonrpc: "2.0", id: rpc.id, result: await handle(ctx, ownerId, rpc) });
  } catch (error) {
    const e = error as Error & { code?: number };
    return json({ jsonrpc: "2.0", id: rpc.id, error: { code: e.code ?? -32603, message: e.message } });
  }
});

const http = httpRouter();
http.route({ path: "/mcp", method: "POST", handler: mcp });
http.route({ path: "/mcp", method: "GET", handler: httpAction(async () => new Response(null, { status: 405 })) });
export default http;
