// PROTOTYPE — throwaway. Aggregates results/runs/*/result.json into results/scorecard.md and results/summary.json.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const RUNS = join(ROOT, "results", "runs");
type R = {
  id: string; client: string; surface: string; task: string; success: boolean; score: number; ruleBreaks: string[]; calls: number; rejected: number;
  partialRejections: number; invalid: number; tokens: { input: number; cachedInput: number; output: number }; ms: number; skillBeforeWrite: boolean;
  skillsLoaded: string[]; expectedSkill?: string; errors: string[]; checks: { name: string; pass: boolean; critical: boolean }[]; uploadEvents: string[];
};
const runs: R[] = readdirSync(RUNS)
  .filter((d) => existsSync(join(RUNS, d, "result.json")))
  .map((d) => JSON.parse(readFileSync(join(RUNS, d, "result.json"), "utf8")))
  .map((r) => ({ ...r, ruleBreaks: r.checks.filter((c: any) => c.ruleBreak && !c.pass).map((c: any) => c.name) }));

const CLIENTS = [["sonnet", "Sonnet 5.5 (Claude Code)"], ["sol", "GPT-6.1 Sol (Codex)"]] as const;
const SURFACES = ["A", "B", "C", "D"];
const TASKS = ["T1", "T2", "T3", "T4", "T5", "T6"];
const TASK_TITLES: Record<string, string> = { T1: "upload + scenes", T2: "debrief", T3: "prep questions", T4: "plank answer", T5: "frame update", T6: "fix mistake" };

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (x: number) => (Number.isNaN(x) ? "–" : `${Math.round(x * 100)}%`);
const k = (x: number) => (Number.isNaN(x) ? "–" : `${(x / 1000).toFixed(0)}k`);
const f1 = (x: number) => (Number.isNaN(x) ? "–" : x.toFixed(1));
const pick = (f: Partial<R>) => runs.filter((r) => Object.entries(f).every(([key, v]) => (r as any)[key] === v));
const passFraction = (rs: R[]) => (rs.length ? `${rs.filter((r) => r.success).length}/${rs.length}` : "–");

function stats(rs: R[]) {
  return {
    n: rs.length,
    success: avg(rs.map((r) => (r.success ? 1 : 0))),
    score: avg(rs.map((r) => r.score)),
    calls: avg(rs.map((r) => r.calls)),
    rejected: avg(rs.map((r) => r.rejected + r.partialRejections)),
    invalid: avg(rs.map((r) => r.invalid)),
    input: avg(rs.map((r) => r.tokens.input)),
    uncached: avg(rs.map((r) => r.tokens.input - r.tokens.cachedInput)),
    output: avg(rs.map((r) => r.tokens.output)),
    minutes: avg(rs.map((r) => r.ms / 60000)),
    ruleBreaks: rs.reduce((a, r) => a + r.ruleBreaks.length, 0),
    errors: rs.filter((r) => r.errors.length).length,
  };
}

const lines: string[] = [];
const out = (s = "") => lines.push(s);
const main = runs.filter((r) => TASKS.includes(r.task));

out("# Scorecard: which MCP tool surface helps the AI most?");
out();
out(`Throwaway prototype for Omni-GM ticket #10. ${main.length} task runs plus ${pick({ task: "U-page" }).length} upload-page runs, invented data only.`);
out("Surfaces: **A** few deep tools (spec draft), **B** many narrow verbs, **C** narrow writes + `find`/`get` + `skill` tool, **D** C without `skill`, procedures in server instructions.");
out();
out("## Overall, per client and surface");
out();
out("| Client | Surface | Success | Check score | Calls/task | Rejected/task | Invalid/task | Input tokens/task | Output tokens/task | Rule breaks | Errors |");
out("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const [client, label] of CLIENTS)
  for (const surface of SURFACES) {
    const s = stats(main.filter((r) => r.client === client && r.surface === surface));
    out(`| ${label} | ${surface} | ${pct(s.success)} (${s.n}) | ${pct(s.score)} | ${f1(s.calls)} | ${f1(s.rejected)} | ${f1(s.invalid)} | ${k(s.input)} | ${k(s.output)} | ${s.ruleBreaks} | ${s.errors} |`);
  }
out();
out("## Both clients together, per surface");
out();
out("| Surface | Success | Check score | Calls/task | Rejected/task | Rule breaks |");
out("|---|---:|---:|---:|---:|---:|");
for (const surface of SURFACES) {
  const s = stats(main.filter((r) => r.surface === surface));
  out(`| ${surface} | ${pct(s.success)} (${s.n}) | ${pct(s.score)} | ${f1(s.calls)} | ${f1(s.rejected)} | ${s.ruleBreaks} |`);
}
out();
out("## Success per task (passed runs / runs)");
out();
out(`| Client | Surface | ${TASKS.map((t) => `${t} ${TASK_TITLES[t]}`).join(" | ")} |`);
out(`|---|---|${TASKS.map(() => "---:").join("|")}|`);
for (const [client, label] of CLIENTS)
  for (const surface of SURFACES) out(`| ${label} | ${surface} | ${TASKS.map((task) => passFraction(pick({ client, surface, task } as any))).join(" | ")} |`);
out();
out("## Skill loading on surface C (expected procedure loaded before the first write, unprompted)");
out();
out(`| Client | ${TASKS.filter((t) => t !== "T6").map((t) => `${t} (${TASK_TITLES[t]})`).join(" | ")} |`);
out(`|---|${TASKS.filter((t) => t !== "T6").map(() => "---:").join("|")}|`);
for (const [client, label] of CLIENTS)
  out(`| ${label} | ${TASKS.filter((t) => t !== "T6").map((task) => { const rs = pick({ client, surface: "C", task } as any); return rs.length ? `${rs.filter((r) => r.skillBeforeWrite || (task === "T3" && r.skillsLoaded.includes(r.expectedSkill!))).length}/${rs.length}` : "–"; }).join(" | ")} |`);
out();
out("## Upload paths per client");
out();
out("| Client | Path | Success | Transcript through model output | Input tokens/run | Output tokens/run | Minutes/run |");
out("|---|---|---:|---:|---:|---:|---:|");
for (const [client, label] of CLIENTS) {
  const signed = pick({ client, task: "T1" } as any);
  const page = pick({ client, task: "U-page" } as any);
  const leak = (rs: R[]) => `${rs.filter((r) => r.checks.some((c) => c.name.startsWith("transcript never") && !c.pass)).length}/${rs.length}`;
  const stored = (rs: R[]) => `${rs.filter((r) => r.checks.find((c) => c.name === "transcript stored byte-exact")?.pass).length}/${rs.length} stored, ${rs.filter((r) => r.success).length}/${rs.length} full task`;
  for (const [path, rs] of [["signed upload URL (all surfaces)", signed], ["upload page behind sign-in (C, GM uploads)", page]] as const) {
    const s = stats(rs);
    out(`| ${label} | ${path} | ${stored(rs)} | ${leak(rs)} | ${k(s.input)} | ${k(s.output)} | ${f1(s.minutes)} |`);
  }
}
out();
out("## Failed critical checks (count of runs)");
out();
const failures = new Map<string, number>();
for (const r of main) for (const c of r.checks) if (c.critical && !c.pass) failures.set(`${r.client} ${r.surface} ${r.task}: ${c.name}`, (failures.get(`${r.client} ${r.surface} ${r.task}: ${c.name}`) ?? 0) + 1);
for (const [name, n] of [...failures].sort()) out(`- ${name} (${n})`);
out();
out("## Rule breaks");
out();
for (const r of main.filter((r) => r.ruleBreaks.length)) out(`- ${r.id}: ${r.ruleBreaks.join(", ")}`);

writeFileSync(join(ROOT, "results", "scorecard.md"), lines.join("\n") + "\n");
writeFileSync(
  join(ROOT, "results", "summary.json"),
  JSON.stringify(Object.fromEntries(CLIENTS.flatMap(([client]) => SURFACES.map((s) => [`${client}-${s}`, stats(main.filter((r) => r.client === client && r.surface === s))]))), null, 1),
);
console.log(lines.join("\n"));
