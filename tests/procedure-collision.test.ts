import { expect, test, vi } from "vitest";

vi.mock("../convex/skillFiles", () => ({
  skillFiles: {
    debrief: { description: "A second debrief", procedure: "Replaced." },
  },
}));

test("a SKILL.md that reuses a written procedure's name stops the server instead of replacing it", async () => {
  const { client } = await import("./mcp-client");
  const c = client();
  await expect(c.init()).rejects.toThrow("Procedures defined twice: debrief");
});
