import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Agent SDK ships native binaries and spawns a Claude Code subprocess,
  // so it must be required at runtime rather than traced into the bundle.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
};

export default nextConfig;
