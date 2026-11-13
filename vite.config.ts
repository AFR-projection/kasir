import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(rootDir, "client"),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: false,
      },
      "/uploads": {
        target: "http://localhost:4000",
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: path.join(rootDir, "client/dist"),
    emptyOutDir: true,
    sourcemap: false,
  },
});
