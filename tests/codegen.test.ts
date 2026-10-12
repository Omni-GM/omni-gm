import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, expect, test } from "vitest";

const toolsWithoutRipgrep = [
  "bash",
  "mkdir",
  "rm",
  "cp",
  "ln",
  "dirname",
  "grep",
];
const sandboxes: string[] = [];

afterEach(async () => {
  for (const sandbox of sandboxes.splice(0))
    await rm(sandbox, { recursive: true, force: true });
});

function locate(tool: string): string {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = join(dir, tool);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  throw new Error(`${tool} is not on PATH`);
}

async function projectWithoutRipgrep(deployment: string) {
  const root = await mkdtemp(join(tmpdir(), "omni-gm-codegen-"));
  sandboxes.push(root);
  const project = join(root, "project");
  const bin = join(root, "bin");
  await mkdir(join(project, "scripts"), { recursive: true });
  await mkdir(join(project, "convex"));
  await mkdir(join(project, "node_modules"));
  await mkdir(join(project, ".codegen"));
  await mkdir(bin);
  await copyFile("scripts/codegen.sh", join(project, "scripts/codegen.sh"));
  await writeFile(join(project, "package.json"), "{}\n");
  await writeFile(
    join(project, ".codegen/.env.local"),
    `CONVEX_DEPLOYMENT=${deployment}\n`,
  );
  for (const tool of toolsWithoutRipgrep)
    await symlink(locate(tool), join(bin, tool));
  const calls = join(root, "pnpm-calls.log");
  await writeFile(
    join(bin, "pnpm"),
    `#!${locate("bash")}\necho "$*" >> ${calls}\nmkdir -p convex/_generated\necho generated > convex/_generated/api.d.ts\n`,
  );
  await chmod(join(bin, "pnpm"), 0o755);
  const run = () =>
    spawnSync(locate("bash"), [join(project, "scripts/codegen.sh")], {
      env: { PATH: bin },
      encoding: "utf8",
    });
  const pnpmCalls = () => readFile(calls, "utf8").catch(() => "");
  return { project, run, pnpmCalls };
}

test("codegen refuses a non-anonymous deployment on a machine without ripgrep", async () => {
  const { run, pnpmCalls } = await projectWithoutRipgrep("dev:useful-mole-1");
  const result = run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    "Codegen only uses an anonymous local deployment.",
  );
  expect(await pnpmCalls()).toBe("");
});

test("codegen regenerates types from an anonymous deployment on a machine without ripgrep", async () => {
  const { project, run, pnpmCalls } = await projectWithoutRipgrep(
    "anonymous:anonymous-omni-gm",
  );
  const result = run();
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(await pnpmCalls()).toContain("exec convex codegen");
  expect(
    await readFile(join(project, "convex/_generated/api.d.ts"), "utf8"),
  ).toBe("generated\n");
});
