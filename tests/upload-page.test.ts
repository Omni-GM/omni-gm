import { expect, test } from "vitest";
import { client } from "./mcp-client";

async function sessionWithLinks(c = client()) {
  await c.init();
  await c.call("adventure_start", {
    name: "The Glass Causeway",
    reason: "Arrived",
  });
  const session = await c.call("session_create", { playedOn: "2026-01-03" });
  const links = await c.call("transcript_upload_url", { session: session.id });
  return { c, session, links };
}
const local = (url: string) => new URL(url).pathname + new URL(url).search;

test("transcript_upload_url also links an upload page for clients without a shell", async () => {
  const { c, session, links } = await sessionWithLinks();
  expect(new URL(links.pageUrl).searchParams.get("session")).toBe(session.id);
  const page = await c.t.fetch(local(links.pageUrl));
  expect(page.status).toBe(200);
  expect(page.headers.get("Content-Type")).toContain("text/html");
  expect(await page.text()).toContain("Sign in");
});

test("the upload page refuses anonymous visitors and sessions of another owner, and stores the owner's file byte-exact", async () => {
  const { c, session } = await sessionWithLinks();
  const api = `/upload-page/session?session=${session.id}`;
  const transcript =
    "[00:01:10] GM as Sera Venn: Mind the stones, dear.\r\n[00:02:20] Rowan: Sarah Ven seems nervous.\r\n";

  expect((await c.t.fetch(api)).status).toBe(401);
  expect(
    (await c.t.fetch(api, { method: "PUT", body: transcript })).status,
  ).toBe(401);

  const other = client("other-invented-gm", c.t);
  await other.init();
  await other.call("adventure_start", { name: "Elsewhere", reason: "Test" });
  expect((await other.owner.fetch(api)).status).toBe(404);
  expect(
    (await other.owner.fetch(api, { method: "PUT", body: transcript })).status,
  ).toBe(404);

  const info = await c.owner.fetch(api);
  expect(info.status).toBe(200);
  expect(await info.json()).toEqual({
    ordinal: 1,
    playedOn: "2026-01-03",
    locked: false,
    uploaded: false,
  });
  const stored = await c.owner.fetch(api, { method: "PUT", body: transcript });
  expect(stored.status).toBe(200);
  const read = await c.call("get", { ref: `transcript:${session.id}` });
  expect(read.utterances.map((u: { speaker: string }) => u.speaker)).toEqual([
    "GM as Sera Venn",
    "Rowan",
  ]);
  const bytes = await c.owner.fetch(local(read.downloadUrl));
  expect(await bytes.text()).toBe(transcript);
  expect(await (await c.owner.fetch(api)).json()).toMatchObject({
    uploaded: true,
  });
});

test("split-scenes and the upload tool tell a client without a shell to hand over the page link", async () => {
  const c = client();
  await c.init();
  const skill = await c.call("skill", { name: "split-scenes" });
  expect(skill.procedure).toMatch(/cannot run curl[^\n]*pageUrl/);
  const tools = await c.rpc("tools/list");
  const upload = tools.result.tools.find(
    (t: { name: string }) => t.name === "transcript_upload_url",
  );
  expect(upload.description).toContain("pageUrl");
});
