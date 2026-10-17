import { expect, test } from "vitest";
import { parseSkillFile, readSkillFiles } from "../scripts/skillFile";
import { client } from "./mcp-client";

test("every markdown procedure is served word for word from its SKILL.md", async () => {
  const c = client();
  await c.init();
  const files = await readSkillFiles();
  expect(files.map((file) => file.name)).toContain("transcribe");

  const listed = (await c.call("skill")).skills;
  for (const file of files) {
    expect(listed).toContainEqual({
      name: file.name,
      description: file.description,
    });
    const loaded = await c.call("skill", { name: file.name.toUpperCase() });
    expect(loaded.name).toBe(file.name);
    expect(
      loaded.procedure.startsWith(`${file.procedure}\n\nStanding rules\n`),
    ).toBe(true);
  }
});

test("SKILL.md frontmatter reads the same with CRLF line endings and quoted values", () => {
  const plain = parseSkillFile(
    "---\nname: transcribe\ndescription: Turn a recording: any kind.\n---\n\nBody line.\n",
    "transcribe",
  );
  const quoted = parseSkillFile(
    "---\r\nname: \"transcribe\"\r\ndescription: 'Turn a recording: any kind.'\r\n---\r\n\r\nBody line.\r\n",
    "transcribe",
  );
  expect(quoted).toEqual(plain);
  expect(plain).toEqual({
    name: "transcribe",
    description: "Turn a recording: any kind.",
    procedure: "Body line.",
  });
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
