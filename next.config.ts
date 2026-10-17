import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output ships a self-contained server bundle so the deploy
  // pipeline can build once per commit and deploy by swapping releases (#135).
  output: "standalone",
};

export default nextConfig;
