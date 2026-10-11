import { readFile, writeFile } from "node:fs/promises";
import { build } from "vite";

const root = new URL("..", import.meta.url);
await build({
  configFile: new URL("ledger/vite.config.ts", root).pathname,
  logLevel: "warn",
});
const html = await readFile(new URL(".ledger/index.html", root), "utf8");
await writeFile(
  new URL("convex/ledgerHtml.generated.ts", root),
  `export const ledgerHtml = ${JSON.stringify(html)};\n`,
);
