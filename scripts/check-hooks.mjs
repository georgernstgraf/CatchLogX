#!/usr/bin/env node
// Checks that the pre-push lint gate (see .githooks/pre-push, #111) is active
// in this clone. Warns only — never fails — so onboarding stays smooth (#112).
import { execSync } from "node:child_process";

let hooksPath = "";
try {
  hooksPath = execSync("git config core.hooksPath", {
    stdio: ["pipe", "pipe", "ignore"],
  })
    .toString()
    .trim();
} catch {
  hooksPath = "";
}

if (hooksPath === ".githooks") {
  console.log("✅ Pre-push hook active (.githooks) — pushes to dev are protected by the lint gate.");
} else {
  console.warn("⚠️  Pre-push hook NOT active — pushes to dev are NOT protected by the lint gate!");
  console.warn("   Activate it once per clone:");
  console.warn("");
  console.warn("       git config core.hooksPath .githooks");
  console.warn("");
  console.warn("   Then re-run: npm run check:hooks");
}
