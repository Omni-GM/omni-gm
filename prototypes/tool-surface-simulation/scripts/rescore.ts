// PROTOTYPE — throwaway. Re-runs the gold checks on finished runs after a scorer fix.
// Needs state-turn1.json for two-turn tasks; single-turn tasks use the final state.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { GUESS_TRAP_TASK, TASKS, UPLOAD_PAGE_TASK } from "../src/tasks";

const RUNS = resolve(import.meta.dir, "..", "results", "runs");
const all = [...TASKS, GUESS_TRAP_TASK, UPLOAD_PAGE_TASK];
let changed = 0;
for (const id of readdirSync(RUNS)) {
  const dir = join(RUNS, id);
  if (!existsSync(join(dir, "result.json")) || !existsSync(join(dir, "seed.json"))) continue;
  const result = JSON.parse(readFileSync(join(dir, "result.json"), "utf8"));
  if (result.task === "T1" || result.task === "U-page") continue;
  const task = all.find((t) => t.id === result.task)!;
  const final = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
  const turn1 = existsSync(join(dir, "state-turn1.json")) ? JSON.parse(readFileSync(join(dir, "state-turn1.json"), "utf8")) : task.turns.length === 1 ? final : null;
  if (!turn1) continue;
  const calls = readFileSync(join(dir, "log.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const checks = task.checks({ final, afterTurn1: turn1, seed: JSON.parse(readFileSync(join(dir, "seed.json"), "utf8")), calls, answer: result.answer, modelOutput: result.modelOutput ?? "" });
  const next = { ...result, checks, success: checks.filter((c) => c.critical).every((c) => c.pass), score: checks.filter((c) => c.pass).length / checks.length, ruleBreaks: checks.filter((c) => c.ruleBreak && !c.pass).map((c) => c.name) };
  if (JSON.stringify(next.checks) !== JSON.stringify(result.checks)) {
    changed++;
    console.log(`${id}: ${result.success} -> ${next.success}`);
    writeFileSync(join(dir, "result.json"), JSON.stringify(next, null, 1));
  }
}
console.log(`${changed} runs rescored`);
