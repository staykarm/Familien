import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Profilbilder skaleres ned i nettleseren, men gi litt slingringsmonn for store originaler.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
