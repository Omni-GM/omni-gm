import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const step = process.argv[2];
assert(
  step === "before" || step === "after",
  "Run with before on main, then after on the reveal branch",
);
const url = process.env.OMNI_GM_MCP_URL;
const token = process.env.OMNI_GM_ACCESS_TOKEN;
assert(url && token, "Set OMNI_GM_MCP_URL and OMNI_GM_ACCESS_TOKEN");
const client = new Client({ name: "omni-gm-reveals-upgrade", version: "1" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }),
);
console.log(`PROOF TARGET ${new URL(url).origin}`);

async function call<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const result = (await client.callTool({
    name,
    arguments: args,
  })) as CallToolResult;
  assert(
    !result.isError && result.structuredContent,
    `${name} failed: ${JSON.stringify(result.content)}`,
  );
  return result.structuredContent as T;
}
type Draft = {
  session: string;
  status: string;
  changes: { id: string }[];
  reveals?: { id: string; secret: string; whole: boolean }[];
  briefing: string;
};
const briefing = "Where the party stands\nAt the mill [00:00:10].";

async function draftOnMain() {
  await call("adventure_start", {
    name: "Millbrook",
    reason: "Invented upgrade proof",
  });
  const session = await call<{ id: string }>("session_create", {
    playedOn: "2026-04-04",
  });
  const upload = await call<{ url: string }>("transcript_upload_url", {
    session: session.id,
  });
  const transcript =
    "[00:00:10] GM: The mill wheel is still.\n[00:00:40] GM as Dena Ray: The miller left at dawn with a sealed letter.\n";
  assert.equal(
    (await fetch(upload.url, { method: "PUT", body: transcript })).status,
    200,
  );
  await call("scenes_set", {
    session: session.id,
    scenes: [
      {
        title: "The mill",
        start: "00:00:10",
        place: "Millbrook mill",
        summary: "Dena says the miller left with a letter.",
      },
    ],
  });
  const secret = await call<{ secret: { id: string } }>("secret_write", {
    op: "write",
    text: "The sealed letter names the miller's creditor.",
    reason: "Unplayed background",
  });
  await call("debrief_add", {
    session: session.id,
    briefing,
    changes: [
      {
        scene: 1,
        change: {
          op: "new",
          kind: "npc",
          name: "Dena Ray",
          properties: { playedAs: "Brisk" },
        },
        basis: ["narrated"],
        sources: [{ quote: "The miller left at dawn", at: "00:00:40" }],
        why: "Dena spoke",
      },
    ],
  });
  const draft = await call<{ value: Draft }>("get", {
    ref: `debrief:${session.id}`,
  });
  assert.equal(draft.value.reveals, undefined, "main has no reveals yet");
  console.log(
    `PASS main holds a draft debrief with ${draft.value.changes.length} change and no reveals field`,
  );
  console.log(
    `STATE ${JSON.stringify({ session: session.id, secret: secret.secret.id })}`,
  );
}

async function revealAfterUpgrade() {
  const state = JSON.parse(process.env.UPGRADE_STATE ?? "null");
  assert(state, "Set UPGRADE_STATE from the before step");
  const before = await call<{ value: Draft }>("get", {
    ref: `debrief:${state.session}`,
  });
  assert.deepEqual(before.value.reveals, []);
  assert.equal(before.value.changes.length, 1);
  assert.equal(before.value.briefing, briefing);
  console.log(
    "PASS after the upgrade the stored draft reads with its change and briefing intact and reveals: []",
  );
  const added = await call<{ draft: Draft; rejectedReveals: unknown[] }>(
    "debrief_add",
    {
      session: state.session,
      changes: [],
      reveals: [
        {
          secret: state.secret,
          scene: 1,
          learned: "The miller left at dawn with a sealed letter.",
          sources: [{ quote: "The miller left at dawn", at: "00:00:40" }],
          whole: false,
        },
      ],
    },
  );
  assert.deepEqual(added.rejectedReveals, []);
  const { commit } = await call<{ commit: string }>("debrief_commit", {
    session: state.session,
  });
  const secret = await call<{
    value: { status: string; history: { op: string; commit: string }[] };
  }>("get", { ref: state.secret });
  assert.equal(secret.value.status, "partly_revealed");
  assert.deepEqual(
    secret.value.history.map((h) => [h.op, h.commit === commit]),
    [
      ["write", false],
      ["reveal", true],
    ],
  );
  console.log(
    "PASS the pre-upgrade draft takes a reveal and commits it: the secret is partly_revealed with its reveal on the debrief commit",
  );
}

try {
  if (step === "before") await draftOnMain();
  else await revealAfterUpgrade();
} finally {
  await client.close();
}
