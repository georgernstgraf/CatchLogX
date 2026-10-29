import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

// Version shown on the About page; read once at config load (#176).
const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
) as { version: string };

const nextConfig: NextConfig = {
  // Standalone output ships a self-contained server bundle so the deploy
  // pipeline can build once per commit and deploy by swapping releases (#135).
  output: "standalone",
  // Build-time identity of the running release (#176). `GITHUB_SHA` is set by
  // the deploy job, so every immutable release reports its own commit.
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_GIT_SHA: process.env.GITHUB_SHA ?? "",
  },
};

export default nextConfig;
