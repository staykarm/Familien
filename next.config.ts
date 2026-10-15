import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Service workeren for pushvarsler skal alltid hentes på nytt, så oppdateringer når fram.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  experimental: {
    // Profilbilder skaleres ned i nettleseren, men gi litt slingringsmonn for store originaler.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
