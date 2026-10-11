import { expect, test } from "vitest";
import { client } from "./mcp-client";

const original = {
  sections: [
    { name: "Strong start", definition: "Two or three opening situations." },
    {
      name: "Clues",
      definition: "Ten short clues the characters could learn.",
    },
  ],
  template: "# Session\n## Strong start\n## Clues\n",
};

async function campaign(
  subject = "invented-gm",
  shared?: ReturnType<typeof client>["t"],
) {
  const c = client(subject, shared);
  await c.init();
  await c.call("adventure_start", {
    name: "The Amber Ferry",
    reason: "Invented checklist proof",
  });
  return c;
}

test("the game master stores ordered sections, definitions and the markdown template for any client", async () => {
  const c = await campaign();
  expect(await c.call("get", { ref: "checklist" })).toMatchObject({
    checklist: null,
    history: [],
  });
  const saved = await c.call("checklist_set", {
    ...original,
    reason: "My prep process",
  });
  expect(saved.checklist).toEqual(original);
  const anotherClient = client("invented-gm", c.t);
  await anotherClient.init();
  expect(await anotherClient.call("get", { ref: "checklist" })).toMatchObject({
    checklist: original,
  });
  await c.call("adventure_start", {
    name: "The Copper Stair",
    reason: "Next adventure",
  });
  expect(await c.call("get", { ref: "checklist" })).toMatchObject({
    checklist: original,
  });
});

test("replacement retains both versions and their reasons through paginated checklist history", async () => {
  const c = await campaign();
  const first = await c.call("checklist_set", {
    ...original,
    reason: "My prep process",
  });
  const replacement = {
    sections: [original.sections[1], original.sections[0]],
    template: "# Next session\n## Clues\n## Strong start",
  };
  const second = await c.call("checklist_set", {
    ...replacement,
    reason: "Start with clues",
  });
  const page1 = await c.call("get", { ref: "checklist", limit: 1 });
  expect(page1.checklist).toEqual(replacement);
  expect(page1.history).toEqual([
    {
      commit: first.commit,
      reason: "My prep process",
      before: null,
      after: original,
    },
  ]);
  expect(page1.truncated).toBe(true);
  const page2 = await c.call("get", {
    ref: "checklist",
    limit: 1,
    cursor: page1.nextCursor,
  });
  expect(page2.history).toEqual([
    {
      commit: second.commit,
      reason: "Start with clues",
      before: original,
      after: replacement,
    },
  ]);
  expect(page2.truncated).toBe(false);
  expect(page2.nextCursor).toBeNull();
  expect(
    (await c.call("get", { ref: "overview" })).commits.slice(0, 2),
  ).toMatchObject([
    { id: second.commit, kind: "checklist", reason: "Start with clues" },
    { id: first.commit, kind: "checklist", reason: "My prep process" },
  ]);
});

test("an empty checklist is rejected without changing the current version or history", async () => {
  const c = await campaign();
  await c.call("checklist_set", { ...original, reason: "My prep process" });
  const before = await c.call("get", { ref: "checklist" });
  await expect(
    c.call("checklist_set", {
      ...original,
      sections: [],
      reason: "Invalid replacement",
    }),
  ).rejects.toThrow("1 to 100 sections");
  expect(await c.call("get", { ref: "checklist" })).toEqual(before);
});

test.each([
  [
    "blank section name",
    { sections: [{ name: " \t", definition: "Opening situations" }] },
    "Section names and definitions must be non-empty",
  ],
  [
    "blank definition",
    { sections: [{ name: "Start", definition: " \n" }] },
    "Section names and definitions must be non-empty",
  ],
  [
    "duplicate names",
    {
      sections: [
        { name: "Clues", definition: "First" },
        { name: " clues ", definition: "Second" },
      ],
    },
    "Section names must be unique",
  ],
  ["blank reason", { reason: " \n" }, "A reason is required"],
  ["blank template", { template: " \n" }, "A markdown template is required"],
])("%s is rejected atomically", async (_name, invalid, message) => {
  const c = await campaign();
  await c.call("checklist_set", { ...original, reason: "My prep process" });
  const before = await c.call("get", { ref: "checklist" });
  const overview = await c.call("get", { ref: "overview" });
  await expect(
    c.call("checklist_set", {
      ...original,
      reason: "Invalid replacement",
      ...invalid,
    }),
  ).rejects.toThrow(message);
  expect(await c.call("get", { ref: "checklist" })).toEqual(before);
  expect(await c.call("get", { ref: "overview" })).toEqual(overview);
});

test("the UTF-8 payload bound includes definitions, template and reason and rejects without writing", async () => {
  const c = await campaign();
  const reason = "My prep process";
  const atLimit = { ...original, template: "" };
  atLimit.template = "x".repeat(
    32_000 -
      new TextEncoder().encode(JSON.stringify({ ...atLimit, reason })).length,
  );
  await c.call("checklist_set", { ...atLimit, reason });
  const before = await c.call("get", { ref: "checklist" });
  for (const invalid of [
    { template: `${atLimit.template}x` },
    { template: "界".repeat(11_000) },
    { sections: [{ name: "Start", definition: "x".repeat(32_000) }] },
    { reason: "x".repeat(32_000) },
  ]) {
    await expect(
      c.call("checklist_set", { ...original, reason, ...invalid }),
    ).rejects.toThrow("32 KB");
    expect(await c.call("get", { ref: "checklist" })).toEqual(before);
  }
});

test("another owner cannot see or overwrite the checklist, its history or a borrowed continuation", async () => {
  const alice = await campaign("invented-alice");
  await alice.call("checklist_set", { ...original, reason: "Alice's process" });
  await alice.call("checklist_set", {
    ...original,
    reason: "Alice's revised process",
  });
  const before = await alice.call("get", { ref: "checklist" });
  const page = await alice.call("get", { ref: "checklist", limit: 1 });
  const bob = await campaign("invented-bob", alice.t);
  expect(await bob.call("get", { ref: "checklist" })).toMatchObject({
    checklist: null,
    history: [],
  });
  await expect(
    bob.call("get", { ref: "checklist", limit: 1, cursor: page.nextCursor }),
  ).rejects.toThrow();
  const own = {
    sections: [{ name: "Bobs start", definition: "My own opening" }],
    template: "# Bobs session",
  };
  await bob.call("checklist_set", { ...own, reason: "Bob's process" });
  expect(await bob.call("get", { ref: "checklist" })).toMatchObject({
    checklist: own,
    history: [{ before: null, after: own, reason: "Bob's process" }],
  });
  expect(await alice.call("get", { ref: "checklist" })).toEqual(before);
  const spoofed = await bob.rpc("tools/call", {
    name: "checklist_set",
    arguments: {
      ...own,
      reason: "Spoofed owner",
      caller: { subject: "invented-alice" },
    },
  });
  expect(spoofed.error || spoofed.result?.isError).toBeFalsy();
  expect(
    (await bob.call("get", { ref: "checklist" })).history.at(-1),
  ).toMatchObject({ reason: "Spoofed owner", after: own });
  expect(await alice.call("get", { ref: "checklist" })).toEqual(before);
});

test("too many sections and a malformed section leave an unset checklist and commits untouched", async () => {
  const c = await campaign();
  const before = await c.call("get", { ref: "overview" });
  await expect(
    c.call("checklist_set", {
      ...original,
      sections: Array.from({ length: 101 }, (_, i) => ({
        name: `Section ${i}`,
        definition: "Invented",
      })),
      reason: "Too many sections",
    }),
  ).rejects.toThrow("1 to 100 sections");
  await expect(
    c.call("checklist_set", {
      ...original,
      sections: [{ name: "Start" }],
      reason: "Missing definition",
    }),
  ).rejects.toThrow();
  expect(await c.call("get", { ref: "checklist" })).toMatchObject({
    checklist: null,
    history: [],
  });
  expect(await c.call("get", { ref: "overview" })).toEqual(before);
});
