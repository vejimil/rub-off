import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // `npm run dev` opened from a phone on the same Wi-Fi (to shoot and upload a garment there).
  // Development only; private network addresses.
  allowedDevOrigins: ["192.168.*.*", "172.*.*.*", "10.*.*.*"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
