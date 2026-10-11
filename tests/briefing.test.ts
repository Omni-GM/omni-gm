import { expect, test } from "vitest";
import { client } from "./mcp-client";

async function servedStandingRules(c: ReturnType<typeof client>) {
  const init = await c.init();
  const instructions: string = init.result.instructions;
  return instructions.slice(instructions.indexOf("\n") + 1);
}

test("prep opens with the briefing skill, and every skill carries the pitch guardrails instead of a ban on drafting prep", async () => {
  const c = client();
  const rules = await servedStandingRules(c);
  expect(rules).not.toContain("Never draft prep");
  for (const guardrail of [
    "built on",
    "never outcomes",
    "section's definition",
    "never block",
    "Only the game master's picks",
  ])
    expect(rules).toContain(guardrail);

  const listed = (await c.call("skill")).skills.map(
    (s: { name: string }) => s.name,
  );
  expect(listed.slice(0, 2)).toEqual(["briefing", "prep-sparring"]);
  for (const name of listed) {
    const loaded = await c.call("skill", { name });
    expect(loaded.procedure.endsWith(`\n\nStanding rules\n${rules}`)).toBe(
      true,
    );
  }
  expect((await c.call("skill", { name: "Briefing" })).name).toBe("briefing");
});

test("no tool tells the client to never draft prep, and the skill tool names the briefing", async () => {
  const c = client();
  await c.init();
  const tools: { name: string; description: string }[] = (
    await c.rpc("tools/list")
  ).result.tools;
  for (const tool of tools)
    expect(tool.description, tool.name).not.toMatch(/never draft prep/i);
  expect(tools.find((t) => t.name === "skill")?.description).toContain(
    "briefing",
  );
});
