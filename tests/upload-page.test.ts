import { afterEach, expect, test, vi } from "vitest";
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

  await c.call("scenes_set", {
    session: session.id,
    scenes: [
      {
        title: "The ferry",
        start: "00:01:10",
        place: "Glass Causeway",
        summary: "Sera offers passage.",
      },
    ],
  });
  expect(await (await c.owner.fetch(api)).json()).toMatchObject({
    locked: true,
  });
  const replaced = await c.owner.fetch(api, {
    method: "PUT",
    body: "[00:00:01] GM: A different session.\n",
  });
  expect(replaced.status).toBe(409);
  expect(await (await c.owner.fetch(local(read.downloadUrl))).text()).toBe(
    transcript,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("the page exchanges its sign-in code through the site with its own client and returns only the access token", async () => {
  vi.stubEnv("WORKOS_AUTHKIT_DOMAIN", "https://authkit.example.com");
  const authkit = vi.fn(async (_url: string, _init: RequestInit) =>
    Response.json({
      access_token: "invented-access-token",
      refresh_token: "invented-refresh-token",
      user: { email: "gm@example.com" },
    }),
  );
  vi.stubGlobal("fetch", authkit);
  const c = client();
  const exchanged = await c.t.fetch("/upload-page/token", {
    method: "POST",
    body: new URLSearchParams({
      code: "invented-code",
      code_verifier: "invented-verifier",
      client_id: "https://attacker.example.com/client.json",
    }),
  });
  expect(exchanged.status).toBe(200);
  expect(await exchanged.json()).toEqual({
    access_token: "invented-access-token",
  });
  const [url, init] = authkit.mock.calls[0];
  expect(url).toBe("https://authkit.example.com/oauth2/token");
  expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
    grant_type: "authorization_code",
    code: "invented-code",
    code_verifier: "invented-verifier",
    client_id: "https://test.convex.site/upload-page/client.json",
    redirect_uri: "https://test.convex.site/upload-page",
  });

  authkit.mockResolvedValueOnce(
    Response.json({ error: "invalid_grant" }, { status: 400 }),
  );
  const refused = await c.t.fetch("/upload-page/token", {
    method: "POST",
    body: new URLSearchParams({ code: "used", code_verifier: "x" }),
  });
  expect(refused.status).toBe(400);
});
