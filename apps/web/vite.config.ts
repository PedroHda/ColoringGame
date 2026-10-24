import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: fileURLToPath(new URL("../../assets", import.meta.url)),
  base: "./",
  plugins: [react()],
  server: {
    port: 4173,
    fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] },
  },
  build: { outDir: "../../build", emptyOutDir: true, target: "es2022" },
  worker: { format: "es" },
});
