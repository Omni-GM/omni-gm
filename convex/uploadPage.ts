import { httpAction } from "./_generated/server";
import { siteUrl } from "./uploads";

const pagePath = "/upload-page";
const clientPath = "/upload-page/client.json";

function clientMetadata() {
  return {
    client_id: `${siteUrl()}${clientPath}`,
    client_name: "Omni-GM transcript upload",
    redirect_uris: [`${siteUrl()}${pagePath}`],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

function pageConfig() {
  const authkit = process.env.WORKOS_AUTHKIT_DOMAIN ?? "";
  return {
    authorize: `${authkit}/oauth2/authorize`,
    token: `${authkit}/oauth2/token`,
    clientId: `${siteUrl()}${clientPath}`,
    redirectUri: `${siteUrl()}${pagePath}`,
    api: `${siteUrl()}${pagePath}/session`,
  };
}

const script = `
const params = new URLSearchParams(location.search);
const tokenKey = "omni-gm-upload-token";
const pkceKey = "omni-gm-upload-pkce";
let session = params.get("session");

function show(view, message) {
  for (const el of document.querySelectorAll("[data-view]"))
    el.hidden = el.dataset.view !== view;
  if (message !== undefined)
    document.getElementById(view + "-message").textContent = message;
}
function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
}
function randomString(size) {
  return base64url(crypto.getRandomValues(new Uint8Array(size)));
}
async function signIn() {
  const verifier = randomString(32);
  const state = randomString(16);
  sessionStorage.setItem(pkceKey, JSON.stringify({ verifier, state, session }));
  const challenge = base64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const url = new URL(config.authorize);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid profile email",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  }).toString();
  location.assign(url.toString());
}
async function finishSignIn() {
  const saved = JSON.parse(sessionStorage.getItem(pkceKey) || "null");
  sessionStorage.removeItem(pkceKey);
  if (!saved || saved.state !== params.get("state"))
    throw new Error("The sign-in expired. Sign in again.");
  const response = await fetch(config.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.get("code"),
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      code_verifier: saved.verifier,
    }),
  });
  if (!response.ok) throw new Error("The sign-in failed. Sign in again.");
  sessionStorage.setItem(tokenKey, (await response.json()).access_token);
  session = saved.session;
  history.replaceState(null, "", config.redirectUri + "?session=" + encodeURIComponent(session));
}
function signOut() {
  sessionStorage.removeItem(tokenKey);
  show("signin", "Sign in to upload this session's transcript.");
}
async function request(method, body) {
  const response = await fetch(config.api + "?session=" + encodeURIComponent(session), {
    method,
    headers: { Authorization: "Bearer " + sessionStorage.getItem(tokenKey) },
    body,
  });
  if (response.status === 401) {
    signOut();
    return null;
  }
  return response;
}
async function load() {
  const response = await request("GET");
  if (!response) return;
  if (response.status === 404)
    return show("refused", "This session is not in your campaign. Sign in with the account your AI client uses, or ask it for a new link.");
  const info = await response.json();
  if (info.locked)
    return show("refused", "Session " + info.ordinal + " already has scenes or a debrief, so its transcript is locked.");
  show("ready", "Session " + info.ordinal + ", played " + info.playedOn + (info.uploaded ? ". A new file replaces the stored transcript." : "."));
}
async function upload(file) {
  if (!file) return;
  show("busy", "Uploading " + file.name + "…");
  const response = await request("PUT", file);
  if (!response) return;
  if (response.ok)
    return show("done", file.name + " is stored. Go back to your AI client and tell it to continue.");
  show("ready", (await response.text()) + ". Fix the file and drop it again.");
}

document.getElementById("signin-button").addEventListener("click", signIn);
document.getElementById("signout-button").addEventListener("click", signOut);
const drop = document.getElementById("drop");
const input = document.getElementById("file");
input.addEventListener("change", () => upload(input.files[0]));
drop.addEventListener("dragover", (event) => { event.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("over");
  upload(event.dataTransfer.files[0]);
});

(async () => {
  try {
    if (params.has("code")) await finishSignIn();
    if (!session) return show("refused", "This link has no session. Ask your AI client for a new upload link.");
    if (!sessionStorage.getItem(tokenKey)) return show("signin", "Sign in to upload this session's transcript.");
    await load();
  } catch (error) {
    show("signin", error.message);
  }
})();
`;

const style = `
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: Canvas; color: CanvasText; }
main { width: min(32rem, calc(100vw - 2rem)); display: grid; gap: 1rem; }
h1 { font-size: 1.25rem; margin: 0; }
p { margin: 0; line-height: 1.5; }
button, label.button { justify-self: start; font: inherit; padding: 0.5rem 1rem; border-radius: 0.5rem; border: 1px solid currentColor; background: none; color: inherit; cursor: pointer; }
#drop { display: grid; gap: 0.75rem; place-items: center; padding: 2.5rem 1rem; border: 2px dashed GrayText; border-radius: 0.75rem; text-align: center; }
#drop.over { border-color: Highlight; }
#file { position: absolute; width: 1px; height: 1px; opacity: 0; }
.muted { color: GrayText; font-size: 0.875rem; }
[hidden] { display: none !important; }
`;

function html(): string {
  const config = JSON.stringify(pageConfig()).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Upload a transcript · Omni-GM</title>
<style>${style}</style>
</head>
<body>
<main>
  <h1>Upload a session transcript</h1>
  <section data-view="loading"><p id="loading-message">Checking your sign-in…</p></section>
  <section data-view="signin" hidden>
    <p id="signin-message"></p>
    <button id="signin-button" type="button">Sign in</button>
  </section>
  <section data-view="refused" hidden><p id="refused-message"></p></section>
  <section data-view="ready" hidden>
    <div id="drop">
      <p id="ready-message"></p>
      <p>Drop the transcript file here.</p>
      <label class="button" for="file">Choose a file</label>
      <input id="file" type="file" accept=".txt,text/plain">
      <p class="muted">UTF-8 lines like [00:01:10] Speaker: text, at most 2 MB.</p>
    </div>
    <button id="signout-button" type="button">Sign out</button>
  </section>
  <section data-view="busy" hidden><p id="busy-message"></p></section>
  <section data-view="done" hidden><p id="done-message"></p></section>
</main>
<script>const config = ${config};${script}</script>
</body>
</html>`;
}

export const page = httpAction(async () => {
  return new Response(html(), {
    headers: {
      "Content-Type": "text/html;charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
});

export const client = httpAction(async () => Response.json(clientMetadata()));
