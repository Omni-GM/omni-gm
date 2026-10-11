import { expect, test } from "vitest";
import { client } from "./mcp-client";

test("the tool list has no chunk upload tool and calling it fails", async () => {
  const c = client();
  await c.init();
  const listed = await c.rpc("tools/list");
  expect(
    listed.result.tools.map((tool: { name: string }) => tool.name),
  ).not.toContain("transcript_append");
  await expect(
    c.call("transcript_append", {
      session: "session:1",
      chunk: "[00:00:00] GM: The ferry arrives.\n",
      index: 0,
      final: true,
    }),
  ).rejects.toThrow("Unknown tool");
});
