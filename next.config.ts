import type { NextConfig } from "next";

const nextConfig = {
  serverExternalPackages: ["@whiskeysockets/baileys", "discord.js", "better-sqlite3", "@ffmpeg-installer/ffmpeg"],
  typescript: {
    // Skip type checking on next build (we do it locally / CI)
    ignoreBuildErrors: true,
  },
  eslint: {
    // Skip linting on next build
    ignoreDuringBuilds: true,
  },
} as any;

export default nextConfig;
