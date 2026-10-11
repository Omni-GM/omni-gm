import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: { outDir: "../.ledger", emptyOutDir: true },
});
