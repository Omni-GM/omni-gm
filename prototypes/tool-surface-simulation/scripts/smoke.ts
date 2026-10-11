// PROTOTYPE — throwaway. Smoke test: list each surface's tools and run a few calls.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedBeforeSession3 } from "../src/campaign";

for (const surface of ["A", "B", "C", "D"]) {
  const dir = mkdtempSync(join(tmpdir(), "smoke-"));
  writeFileSync(join(dir, "state.json"), JSON.stringify(seedBeforeSession3()));
  const transport = new StdioClientTransport({ command: "bun", args: ["src/server.ts"], env: { ...process.env, SURFACE: surface, STATE: join(dir, "state.json"), LOG: join(dir, "log.jsonl") } as any });
  const client = new Client({ name: "smoke", version: "0" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  const schemaBytes = JSON.stringify(tools).length;
  console.log(surface, tools.length, "tools,", schemaBytes, "bytes of tool schema; instructions", (client.getInstructions() ?? "").length, "chars");
  const call = async (name: string, args: any) => {
    const r: any = await client.callTool({ name, arguments: args });
    return (r.isError ? "ERR " : "") + r.content[0].text.slice(0, 160).replace(/\n/g, " ");
  };
  if (surface === "C") {
    console.log(" ", await call("session_create", { playedOn: "2026-10-10" }));
    const url = JSON.parse((await client.callTool({ name: "transcript_upload_url", arguments: { session: "s3" } }) as any).content[0].text).uploadUrl;
    const put = await fetch(url, { method: "PUT", body: readFileSync("fixtures/session-03-transcript.md") });
    console.log("  upload", put.status, await put.text());
    console.log(" ", await call("find", { query: "Hesk river" }));
    console.log(" ", await call("story_commit", { reason: "x", changes: [{ change: { op: "update", entity: "Maren Vosk", properties: { knows: "cult" } }, basis: ["player_guess"], sources: [{ quote: "q" }], why: "w" }] }));
    console.log(" ", await call("skill", {}));
  }
  await client.close();
  console.log("  log:", readFileSync(join(dir, "log.jsonl"), "utf8").split("\n").filter(Boolean).length, "entries");
}
