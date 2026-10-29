import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// eslint-config-next 16 ships flat configs directly — the FlatCompat bridge
// (@eslint/eslintrc) can no longer load it (#109).
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
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": ["off"],
      // New in react-hooks v6 (shipped with eslint-config-next 16). These flag
      // 8 pre-existing call sites; fix them in #173 and drop the downgrade.
      "react-hooks/set-state-in-effect": ["warn"],
      "react-hooks/immutability": ["warn"],
    },
  },
];

export default eslintConfig;
