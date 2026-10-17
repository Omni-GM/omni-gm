import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

export type SkillFile = {
  name: string;
  description: string;
  procedure: string;
};

function scalar(value: string) {
  if (value.startsWith('"')) return JSON.parse(value) as string;
  if (value.startsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  return value;
}

export function parseSkillFile(text: string, folder: string): SkillFile {
  const [, frontmatter, body] =
    /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replaceAll("\r\n", "\n")) ??
    [];
  assert(frontmatter, `${folder}/SKILL.md needs frontmatter`);
  const field = (key: string) => {
    const value = new RegExp(`^${key}:(.*)$`, "m").exec(frontmatter)?.[1];
    return value === undefined ? undefined : scalar(value.trim());
  };
  const name = field("name");
  const description = field("description");
  assert(name === folder, `${folder}/SKILL.md must be named ${folder}`);
  assert(description, `${folder}/SKILL.md needs a description`);
  return { name, description, procedure: body.trim() };
}

export async function readSkillFiles(root = "skills"): Promise<SkillFile[]> {
  const folders = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    folders.map(async (folder) =>
      parseSkillFile(
        await readFile(`${root}/${folder}/SKILL.md`, "utf8"),
        folder,
      ),
    ),
  );
}
