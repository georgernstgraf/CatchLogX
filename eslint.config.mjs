import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      "app/generated/**",
      "prisma/migrations/**",
      "node_modules/**",
      ".next/**",
      "out/**",
      "**/generated/**",
      "**/*.generated.*",
      "**/runtime/**",
      "**/wasm*.js",
      "**/client.js",
      "**/query_engine-*.node",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": ["off"],
    },
  },
];

export default eslintConfig;
