import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(process.cwd(), "frontend"),
  envDir: resolve(process.cwd()),
  publicDir: resolve(process.cwd(), "frontend/public"),
  server: {
    port: 5173,
    fs: {
      allow: [resolve(process.cwd())]
    }
  },
  build: {
    outDir: resolve(process.cwd(), "dist"),
    emptyOutDir: true,
    sourcemap: false
  }
});
