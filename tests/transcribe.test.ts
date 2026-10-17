import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { client } from "./mcp-client";

function skillFile(path: string) {
  const [, frontmatter, body] =
    /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(readFileSync(path, "utf8")) ?? [];
  const field = (key: string) =>
    new RegExp(`^${key}: (.*)$`, "m").exec(frontmatter)?.[1];
  return {
    name: field("name"),
    description: field("description"),
    body: body.trim(),
  };
}

test("the transcribe procedure is served word for word from its markdown file", async () => {
  const c = client();
  await c.init();
  const file = skillFile("skills/transcribe/SKILL.md");

  const listed = (await c.call("skill")).skills;
  expect(listed).toContainEqual({
    name: "transcribe",
    description: file.description,
  });
  const loaded = await c.call("skill", { name: "Transcribe" });
  expect(file.name).toBe("transcribe");
  expect(loaded.name).toBe("transcribe");
  expect(loaded.procedure.startsWith(`${file.body}\n\nStanding rules\n`)).toBe(
    true,
  );
});

test("a game master with a recording instead of a transcript is sent to transcribe first", async () => {
  const c = client();
  await c.init();
  const tools: { name: string; description: string }[] = (
    await c.rpc("tools/list")
  ).result.tools;
  const skillTool = tools.find((t) => t.name === "skill")?.description;
  for (const { name } of (await c.call("skill")).skills)
    expect(skillTool).toContain(name);
  expect(skillTool).toContain("A recording or another tool's transcript");
  for (const name of ["debrief", "map-speakers"])
    expect((await c.call("skill", { name })).procedure).toContain(
      "load skill transcribe",
    );
});
