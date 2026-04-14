import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "custom-icons.nutrislice.com",
      },
    ],
  },
};

export default nextConfig;
