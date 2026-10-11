// PROTOTYPE — throwaway. Drives headless real clients against the fake server and scores every run.
// bun src/run.ts [--clients sonnet,sol] [--surfaces A,B,C,D] [--tasks T1,...,U-page] [--reps 3] [--concurrency 8]
// Finished runs (results/runs/<id>/result.json) are skipped, so the matrix can run across several sittings.
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Store, type State } from "./domain";
import { transcriptFile } from "./campaign";
import { GUESS_TRAP_TASK, TASKS, UPLOAD_PAGE_TASK, WRITE_TOOLS, type CallLog, type Task } from "./tasks";

const ROOT = resolve(import.meta.dir, "..");
const SERVER = join(ROOT, "src", "server.ts");
const RUNS = join(ROOT, "results", "runs");
const TURN_TIMEOUT_MS = 12 * 60_000;

type Client = "sonnet" | "sol";
type Job = { client: Client; surface: string; task: Task; rep: number; uploadMode: "signed" | "page" };
type Turn = { answer: string; modelOutput: string; tokens: { input: number; cachedInput: number; output: number }; sessionId?: string; error?: string; ms: number };

const { values } = parseArgs({
  options: {
    clients: { type: "string", default: "sonnet,sol" },
    surfaces: { type: "string", default: "A,B,C,D" },
    tasks: { type: "string", default: "T1,T2,T3,T4,T5,T6" },
    reps: { type: "string", default: "3" },
    concurrency: { type: "string", default: "8" },
  },
});

function jobs(): Job[] {
  const list: Job[] = [];
  const all = [...TASKS, GUESS_TRAP_TASK, UPLOAD_PAGE_TASK];
  for (let rep = 1; rep <= Number(values.reps); rep++)
    for (const taskId of values.tasks!.split(","))
      for (const surface of values.surfaces!.split(","))
        for (const client of values.clients!.split(",") as Client[]) {
          const task = all.find((t) => t.id === taskId)!;
          const uploadMode = task.id === "U-page" ? "page" : "signed";
          if (task.id === "U-page" && surface !== "C") continue;
          list.push({ client, surface, task, rep, uploadMode });
        }
  return list;
}

const runId = (j: Job) => `${j.client}-${j.surface}-${j.task.id}-${j.rep}`;

// ---------- clients ----------

function exec(cmd: string, args: string[], opts: { cwd: string; env?: Record<string, string> }): Promise<{ stdout: string; code: number | null; timedOut: boolean }> {
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let timedOut = false;
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", () => {});
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, TURN_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ stdout, code, timedOut });
    });
  });
}

async function claudeTurn(dir: string, prompt: string, resume?: string): Promise<Turn> {
  const started = Date.now();
  const args = [
    "-p", prompt,
    "--model", "claude-sonnet-5-5",
    "--output-format", "stream-json", "--verbose",
    "--setting-sources", "",
    "--strict-mcp-config", "--mcp-config", join(dir, "mcp.json"),
    "--disable-slash-commands",
    "--tools", "Bash",
    "--allowedTools", "mcp__omni-gm__*", "Bash",
    "--permission-mode", "bypassPermissions",
    ...(resume ? ["--resume", resume] : []),
  ];
  const { stdout, timedOut } = await exec("claude", args, { cwd: join(dir, "work") });
  const events = stdout.split("\n").filter(Boolean).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
  let modelOutput = "";
  for (const ev of events)
    if (ev.type === "assistant")
      for (const c of ev.message?.content ?? []) modelOutput += c.type === "text" ? `${c.text}\n` : c.type === "tool_use" ? `${JSON.stringify(c.input)}\n` : "";
  const result = events.find((e) => e.type === "result");
  const usage = Object.values<any>(result?.modelUsage ?? {});
  const sum = (k: string) => usage.reduce((a, u) => a + (u[k] ?? 0), 0);
  return {
    answer: result?.result ?? "",
    modelOutput,
    tokens: { input: sum("inputTokens") + sum("cacheReadInputTokens") + sum("cacheCreationInputTokens"), cachedInput: sum("cacheReadInputTokens"), output: sum("outputTokens") },
    sessionId: result?.session_id ?? events.find((e) => e.session_id)?.session_id,
    error: timedOut ? "timeout" : result?.is_error ? String(result?.result ?? "error") : !result ? "no result" : undefined,
    ms: Date.now() - started,
  };
}

// The model provider comes from the local Codex config, so no machine-specific endpoint lands in this repo.
const CODEX_PROVIDER = (() => {
  const local = readFileSync(join(process.env.HOME!, ".codex", "config.toml"), "utf8");
  const sections = local.split(/\n(?=\[)/);
  const topLevel = sections[0]!.split("\n").filter((l) => /^model_provider\s*=/.test(l));
  const providers = sections.filter((sec) => sec.startsWith("[model_providers."));
  return [
    'model = "gpt-6.1-sol"',
    'model_reasoning_effort = "medium"',
    'approval_policy = "never"',
    'sandbox_mode = "danger-full-access"',
    "suppress_unstable_features_warning = true",
    ...topLevel,
    ...providers,
  ].join("\n");
})();

async function codexTurn(dir: string, prompt: string, resume?: string): Promise<Turn> {
  const started = Date.now();
  const common = ["--json", "--skip-git-repo-check"];
  const args = resume ? ["exec", "resume", ...common, resume, prompt] : ["exec", ...common, "-C", join(dir, "work"), prompt];
  const { stdout, timedOut } = await exec("codex", args, { cwd: join(dir, "work"), env: { CODEX_HOME: join(dir, "codex-home") } });
  const events = stdout.split("\n").filter(Boolean).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
  let modelOutput = "";
  let answer = "";
  const tokens = { input: 0, cachedInput: 0, output: 0 };
  let failed: string | undefined;
  for (const ev of events) {
    const item = ev.item;
    if (ev.type === "item.completed" && item) {
      if (item.type === "agent_message") {
        modelOutput += `${item.text}\n`;
        answer = item.text;
      } else if (item.type === "mcp_tool_call") modelOutput += `${JSON.stringify(item.arguments)}\n`;
      else if (item.type === "command_execution") modelOutput += `${item.command}\n`;
    }
    if (ev.type === "turn.completed") {
      tokens.input += ev.usage?.input_tokens ?? 0;
      tokens.cachedInput += ev.usage?.cached_input_tokens ?? 0;
      tokens.output += (ev.usage?.output_tokens ?? 0) + (ev.usage?.reasoning_output_tokens ?? 0);
    }
    if (ev.type === "turn.failed" || ev.type === "error") failed = JSON.stringify(ev).slice(0, 300);
  }
  const threadId = events.find((e) => e.type === "thread.started")?.thread_id;
  return { answer, modelOutput, tokens, sessionId: threadId ?? resume, error: timedOut ? "timeout" : failed ?? (events.some((e) => e.type === "turn.completed") ? undefined : "no turn"), ms: Date.now() - started };
}

// ---------- one run ----------

function prepare(job: Job, dir: string) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "work"), { recursive: true });
  writeFileSync(join(dir, "seed.json"), JSON.stringify(job.task.seed()));
  copyFileSync(join(dir, "seed.json"), join(dir, "state.json"));
  writeFileSync(join(dir, "log.jsonl"), "");
  if (job.task.needsTranscriptFile) copyFileSync(transcriptFile(3), join(dir, "work", "session-03-transcript.md"));
  const env = { SURFACE: job.surface, STATE: join(dir, "state.json"), LOG: join(dir, "log.jsonl"), UPLOAD_MODE: job.uploadMode };
  writeFileSync(join(dir, "mcp.json"), JSON.stringify({ mcpServers: { "omni-gm": { command: "bun", args: [SERVER], env } } }, null, 1));
  if (job.client === "sol") {
    mkdirSync(join(dir, "codex-home"));
    const envToml = Object.entries(env).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(", ");
    writeFileSync(
      join(dir, "codex-home", "config.toml"),
      `${CODEX_PROVIDER}\n[mcp_servers.omni-gm]\ncommand = "bun"\nargs = [${JSON.stringify(SERVER)}]\nenv = { ${envToml} }\nstartup_timeout_sec = 30\ntool_timeout_sec = 120\n`,
    );
  }
}

function simulateGmUploadThroughPage(dir: string) {
  const store = new Store(JSON.parse(readFileSync(join(dir, "state.json"), "utf8")));
  const target = store.state.sessions.find((s) => s.playedOn === "2026-10-10" && !s.transcript);
  if (target) store.attachTranscript(target.id, readFileSync(transcriptFile(3), "utf8"), "upload-page");
  writeFileSync(join(dir, "state.json"), JSON.stringify(store.state));
}

async function runJob(job: Job) {
  const id = runId(job);
  const dir = join(RUNS, id);
  if (existsSync(join(dir, "result.json"))) return;
  prepare(job, dir);
  const turns: Turn[] = [];
  let afterTurn1: State | undefined;
  for (const [i, prompt] of job.task.turns.entries()) {
    if (job.task.id === "U-page" && i === 1) simulateGmUploadThroughPage(dir);
    const resume = turns.at(-1)?.sessionId;
    const turn = job.client === "sonnet" ? await claudeTurn(dir, prompt, resume) : await codexTurn(dir, prompt, resume);
    turns.push(turn);
    if (i === 0) {
      afterTurn1 = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
      copyFileSync(join(dir, "state.json"), join(dir, "state-turn1.json"));
    }
    if (turn.error) break;
  }
  const calls: (CallLog & { argsBytes?: number })[] = readFileSync(join(dir, "log.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const evidence = {
    final: JSON.parse(readFileSync(join(dir, "state.json"), "utf8")) as State,
    afterTurn1: afterTurn1!,
    seed: JSON.parse(readFileSync(join(dir, "seed.json"), "utf8")) as State,
    calls,
    answer: turns.map((t) => t.answer).join("\n\n"),
    modelOutput: turns.map((t) => t.modelOutput).join("\n"),
  };
  const checks = job.task.checks(evidence);
  const toolCalls = calls.filter((c) => c.tool);
  const skillCalls = toolCalls.filter((c) => c.tool === "skill" && c.args?.name).map((c) => c.args.name as string);
  const firstWrite = toolCalls.findIndex((c) => WRITE_TOOLS.has(c.tool!));
  const skillBeforeWrite = toolCalls.slice(0, firstWrite < 0 ? undefined : firstWrite).some((c) => c.tool === "skill" && c.args?.name === job.task.expectedSkill);
  const result = {
    id,
    client: job.client,
    surface: job.surface,
    task: job.task.id,
    rep: job.rep,
    uploadMode: job.uploadMode,
    success: checks.filter((c) => c.critical).every((c) => c.pass),
    score: checks.filter((c) => c.pass).length / checks.length,
    checks,
    ruleBreaks: checks.filter((c) => c.ruleBreak && !c.pass).map((c) => c.name),
    calls: toolCalls.length,
    rejected: toolCalls.filter((c) => c.outcome !== "ok").length,
    partialRejections: toolCalls.reduce((a, c) => a + (c.partialRejections ?? 0), 0),
    invalid: toolCalls.filter((c) => c.outcome === "invalid" || c.outcome === "unknown_tool").length,
    argsBytes: toolCalls.reduce((a, c) => a + (c.argsBytes ?? 0), 0),
    toolSequence: toolCalls.map((c) => `${c.tool}${c.args?.action ? `:${c.args.action}` : c.args?.view ? `:${c.args.view}` : c.args?.name ? `:${c.args.name}` : ""}${c.outcome === "ok" ? "" : `!${c.outcome}`}`),
    skillsLoaded: skillCalls,
    expectedSkill: job.task.expectedSkill,
    skillBeforeWrite,
    promptsFetched: calls.filter((c) => c.event === "prompt").map((c) => c.name),
    uploadEvents: calls.filter((c) => c.event?.startsWith("upload")).map((c) => c.via ?? c.event),
    tokens: turns.reduce((a, t) => ({ input: a.input + t.tokens.input, cachedInput: a.cachedInput + t.tokens.cachedInput, output: a.output + t.tokens.output }), { input: 0, cachedInput: 0, output: 0 }),
    ms: turns.reduce((a, t) => a + t.ms, 0),
    errors: turns.map((t) => t.error).filter(Boolean),
    answer: evidence.answer,
  };
  rmSync(join(dir, "codex-home"), { recursive: true, force: true });
  rmSync(join(dir, "work"), { recursive: true, force: true });
  writeFileSync(join(dir, "result.json"), JSON.stringify(result, null, 1));
  console.log(`${id}: ${result.success ? "PASS" : "fail"} score=${result.score.toFixed(2)} calls=${result.calls} rejected=${result.rejected + result.partialRejections} tokens=${result.tokens.input}/${result.tokens.output} ${result.errors.join(",")}`);
}

const queue = jobs();
console.log(`${queue.length} runs planned, ${queue.filter((j) => existsSync(join(RUNS, runId(j), "result.json"))).length} already done.`);
await Promise.all(
  Array.from({ length: Number(values.concurrency) }, async () => {
    while (queue.length) await runJob(queue.shift()!).catch((e) => console.error("run failed", e));
  }),
);
