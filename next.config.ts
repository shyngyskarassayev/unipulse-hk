import type { NextConfig } from "next";

// Every page here is per-user and reads cookies, so the app uses the classic
// request-time rendering model instead of Cache Components.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // imapflow and mailparser rely on Node built-ins and dynamic requires.
  serverExternalPackages: ["imapflow", "mailparser"],
};

export default nextConfig;
