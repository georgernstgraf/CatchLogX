import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mirrors the "@/*" path alias from tsconfig.json so tests can use "@/..." imports.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "node",
  },
});
