import { writeFile } from "node:fs/promises";
import { readSkillFiles } from "./skillFile";

const target = "convex/skillFiles.ts";
const files = await readSkillFiles();
const procedures = Object.fromEntries(
  files.map(({ name, description, procedure }) => [
    name,
    { description, procedure },
  ]),
);
await writeFile(
  target,
  `// Generated from skills/*/SKILL.md by pnpm procedures.\nexport const skillFiles: Record<string, { description: string; procedure: string }> = ${JSON.stringify(procedures, null, 2)};\n`,
);
console.log(`${target}: ${files.map((file) => file.name).join(", ")}`);
