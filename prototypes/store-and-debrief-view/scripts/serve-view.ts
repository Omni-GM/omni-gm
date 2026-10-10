// PROTOTYPE — throwaway. A minimal MCP Apps host on http://localhost:4600, so the draft-debrief view
// renders outside Claude: it reads the ui:// resource over MCP, calls debrief_show, and speaks the
// ui/* postMessage protocol with the view. Usage: pnpm view, then open http://localhost:4600/?variant=A
const MCP_URL = process.env.MCP_URL ?? "http://127.0.0.1:3211/mcp";
const TOKEN = process.env.MCP_TOKEN ?? "prototype-local-token";
const PORT = Number(process.env.PORT ?? 4600);

async function rpc(method: string, params: unknown) {
  const response = await fetch(MCP_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await response.json()) as any;
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

const harness = `<!doctype html><html><head><meta charset="utf-8"><title>Draft debrief · prototype host</title>
<style>body{margin:0;background:#e9e6e0;font:13px system-ui} .bar{padding:8px 14px;color:#555}
iframe{display:block;width:min(860px,100%);margin:0 auto 24px;border:0;border-radius:12px;background:#fff;box-shadow:0 2px 16px rgba(0,0,0,.12)}</style></head>
<body><div class="bar">Prototype MCP Apps host · the frame below is the <code>ui://omni-gm/draft-debrief</code> resource</div>
<iframe id="view" style="height:600px"></iframe>
<script>
const frame = document.getElementById("view");
const params = new URLSearchParams(location.search);
frame.src = "/view?variant=" + (params.get("variant") || "A");
const mcp = (method, p) => fetch("/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method, params: p }) }).then(r => r.json());
const send = (msg) => frame.contentWindow.postMessage({ jsonrpc: "2.0", ...msg }, "*");
let debriefId = params.get("debrief");
addEventListener("message", async (e) => {
  const m = e.data; if (!m || m.jsonrpc !== "2.0") return;
  if (m.method === "ui/initialize") send({ id: m.id, result: { protocolVersion: "2026-01-26", hostInfo: { name: "prototype-host", version: "0" }, hostCapabilities: {}, hostContext: { theme: "light", displayMode: "inline" } } });
  if (m.method === "ui/notifications/size-changed") frame.style.height = (m.params.height + 4) + "px";
  if (m.method === "ui/notifications/initialized") {
    if (!debriefId) {
      const s = await mcp("tools/call", { name: "story_structure", arguments: {} });
      const sessions = s.structuredContent.adventures.flatMap(a => a.sessions).filter(x => x.debrief?.status === "draft");
      debriefId = sessions.at(-1)?.debrief.id;
    }
    const args = { debriefId };
    send({ method: "ui/notifications/tool-input", params: { arguments: args } });
    send({ method: "ui/notifications/tool-result", params: await mcp("tools/call", { name: "debrief_show", arguments: args }) });
  }
  if (m.method === "tools/call") send({ id: m.id, result: await mcp("tools/call", m.params) });
});
</script></body></html>`;

Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/") return new Response(harness, { headers: { "content-type": "text/html" } });
    if (url.pathname === "/view") {
      const { contents } = await rpc("resources/read", { uri: "ui://omni-gm/draft-debrief" });
      return new Response(contents[0].text, { headers: { "content-type": "text/html" } });
    }
    if (url.pathname === "/mcp" && request.method === "POST") {
      const { method, params } = (await request.json()) as any;
      return Response.json(await rpc(method, params));
    }
    return new Response("not found", { status: 404 });
  },
});
console.log(`Prototype MCP Apps host on http://localhost:${PORT}/?variant=A  (B, C also)`);
