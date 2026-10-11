import {
  AppBridge,
  getToolUiResourceUri,
  PostMessageTransport,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import type {
  CallToolResult,
  ReadResourceResult,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

type SeededCall = {
  arguments: Record<string, unknown>;
  result: CallToolResult;
};

async function mcp<T>(method: string, params: unknown): Promise<T> {
  const response = await fetch("/host/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function ledgerHtml(): Promise<string> {
  const { tools } = await mcp<{ tools: Tool[] }>("tools/list", {});
  const debriefAdd = tools.find((tool) => tool.name === "debrief_add");
  const uri = debriefAdd && getToolUiResourceUri(debriefAdd);
  if (!uri) throw new Error("debrief_add carries no _meta.ui resource");
  const { contents } = await mcp<ReadResourceResult>("resources/read", {
    uri,
  });
  const [view] = contents;
  if (view?.mimeType !== RESOURCE_MIME_TYPE || !("text" in view))
    throw new Error(`${uri} is not an MCP Apps resource`);
  return view.text;
}

const theme = new URLSearchParams(location.search).get("theme") ?? "light";
document.documentElement.dataset.theme = theme;
const frame = document.createElement("iframe");
frame.title = "Ledger view";
frame.sandbox.add("allow-scripts");
frame.srcdoc = await ledgerHtml();
document.getElementById("view")?.append(frame);

const bridge = new AppBridge(
  null,
  { name: "omni-gm-local-host", version: "0.1.0" },
  { serverTools: {} },
  {
    hostContext: {
      theme: theme === "dark" ? "dark" : "light",
      displayMode: "inline",
      availableDisplayModes: ["inline"],
    },
  },
);
bridge.oncalltool = (params) => mcp<CallToolResult>("tools/call", params);
bridge.onsizechange = ({ height }) => {
  if (height !== undefined) frame.style.height = `${height}px`;
};
bridge.oninitialized = async () => {
  const seeded: SeededCall = await (await fetch("/host/draft")).json();
  await bridge.sendToolInput({ arguments: seeded.arguments });
  await bridge.sendToolResult(seeded.result);
  document.body.dataset.ledger = "rendered";
};
const view = frame.contentWindow;
if (!view) throw new Error("The view frame has no window");
await bridge.connect(new PostMessageTransport(view, view));
