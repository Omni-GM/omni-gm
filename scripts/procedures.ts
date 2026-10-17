import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";

const source = "skills";
const target = "convex/skillFiles.ts";

async function procedure(folder: string) {
  const file = await readFile(`${source}/${folder}/SKILL.md`, "utf8");
  const [, frontmatter, body] =
    /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(file) ?? [];
  assert(frontmatter, `${folder}/SKILL.md needs frontmatter`);
  const field = (key: string) =>
    new RegExp(`^${key}: (.*)$`, "m").exec(frontmatter)?.[1]?.trim();
  const name = field("name");
  const description = field("description");
  assert(name === folder, `${folder}/SKILL.md must be named ${folder}`);
  assert(description, `${folder}/SKILL.md needs a description`);
  return [name, { description, procedure: body.trim() }] as const;
}

const folders = (await readdir(source, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const procedures = Object.fromEntries(
  await Promise.all(folders.map(procedure)),
);
await writeFile(
  target,
  `// Generated from ${source}/*/SKILL.md by pnpm procedures.\nexport const skillFiles: Record<string, { description: string; procedure: string }> = ${JSON.stringify(procedures, null, 2)};\n`,
);
console.log(`${target}: ${folders.join(", ")}`);
