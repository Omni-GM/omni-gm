// PROTOTYPE — throwaway. Renders the scorecard as one self-contained HTML page (results/scorecard.html).
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const RUNS = join(ROOT, "results", "runs");
const runs: any[] = readdirSync(RUNS)
  .filter((d) => existsSync(join(RUNS, d, "result.json")))
  .map((d) => JSON.parse(readFileSync(join(RUNS, d, "result.json"), "utf8")))
  .map((r) => ({ ...r, ruleBreaks: r.checks.filter((c: any) => c.ruleBreak && !c.pass).map((c: any) => c.name) }));

const CLIENTS = [["sonnet", "Sonnet 5.5 · Claude Code"], ["sol", "GPT-6.1 Sol · Codex"]];
const SURFACES = [["A", "Deep tools"], ["B", "Narrow verbs"], ["C", "find/get + skill tool"], ["D", "find/get, procedures in instructions"], ["E", "C + contract fixes"]];
const TASKS = [["T1", "Upload + scenes"], ["T2", "Debrief"], ["T3", "Prep questions"], ["T4", "Plank answer"], ["T5", "Frame update"], ["T6", "Fix mistake"], ["T7", "Guess trap"]];
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const main = runs.filter((r) => r.task !== "U-page");
const cell = (rs: any[]) => {
  if (!rs.length) return `<td class="na">–</td>`;
  const ok = rs.filter((r) => r.success).length;
  const cls = ok === rs.length ? "ok" : ok === 0 ? "bad" : "mid";
  return `<td class="${cls}">${ok}/${rs.length}</td>`;
};
const row = (client: string, surface: string) => {
  const rs = main.filter((r) => r.client === client && r.surface === surface);
  const success = avg(rs.map((r) => (r.success ? 1 : 0)));
  return `<tr><th>${surface}</th>${TASKS.map(([t]) => cell(rs.filter((r) => r.task === t))).join("")}
    <td class="num strong">${Number.isNaN(success) ? "–" : Math.round(success * 100) + "%"}</td>
    <td class="num">${avg(rs.map((r) => r.calls)).toFixed(1)}</td>
    <td class="num">${avg(rs.map((r) => r.rejected + r.partialRejections)).toFixed(1)}</td>
    <td class="num">${Math.round(avg(rs.map((r) => r.tokens.input)) / 1000)}k</td>
    <td class="num">${rs.reduce((a, r) => a + r.ruleBreaks.length, 0)}</td></tr>`;
};

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:var(--font-sans,system-ui);color:var(--foreground,#111);margin:0}
h2{font-size:15px;margin:18px 0 6px} p.sub{color:var(--muted-foreground,#666);font-size:12px;margin:0 0 8px}
table{border-collapse:collapse;width:100%;font-size:13px;margin-bottom:6px}
th,td{padding:5px 6px;border-bottom:1px solid var(--border,#ddd);text-align:center}
thead th{font-weight:600;color:var(--muted-foreground,#666);font-size:11px}
tbody th{text-align:left;font-weight:600}
td.ok{color:var(--success,#16a34a);font-weight:600} td.mid{color:var(--warning,#d97706);font-weight:600} td.bad{color:var(--destructive,#dc2626);font-weight:600}
td.na{color:var(--muted-foreground,#999)} td.num{font-variant-numeric:tabular-nums} td.strong{font-weight:700}
.legend{font-size:12px;color:var(--muted-foreground,#666);display:flex;gap:14px;flex-wrap:wrap}
</style></head><body>
<div class="legend">${SURFACES.map(([s, l]) => `<span><b>${s}</b> ${l}</span>`).join("")}</div>
${CLIENTS.map(
  ([c, label]) => `<h2>${label}</h2><p class="sub">Passed runs per task (all critical gold checks), then averages per task run.</p>
<table><thead><tr><th></th>${TASKS.map(([, t]) => `<th>${t}</th>`).join("")}<th>Success</th><th>Calls</th><th>Rejected</th><th>Input tok</th><th>Rule breaks</th></tr></thead>
<tbody>${SURFACES.map(([s]) => row(c, s)).join("")}</tbody></table>`,
).join("")}
</body></html>`;
writeFileSync(join(ROOT, "results", "scorecard.html"), html);
console.log(html.length);
