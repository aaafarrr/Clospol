import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@whiskeysockets/baileys", "discord.js", "better-sqlite3", "@ffmpeg-installer/ffmpeg"],
};

export default nextConfig;
