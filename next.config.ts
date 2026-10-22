import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: [
    "carb-rip-bear-reliance.trycloudflare.com",
    "carb-rip-hear-reliance.trycloudflare.com",
    "*.trycloudflare.com",
    "192.168.100.48",
  ],
  images: {
    qualities: [75, 80, 85],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      {
        source: "/images/:path*.jpg",
        destination: "/images/:path*.webp",
      },
      {
        source: "/images/:path*.jpeg",
        destination: "/images/:path*.webp",
      },
    ];
  },
};

export default nextConfig;
