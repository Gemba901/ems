import type { NextConfig } from "next";
import withPWA from "next-pwa";

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD === "true" ? "standalone" : undefined,
  turbopack: {},
};

const pwaConfig = withPWA({
  dest: "public/sw",
  disable: process.env.NODE_ENV !== "production",
  register: true,
  skipWaiting: true,
  clientsClaim: true,
});

export default pwaConfig(nextConfig);
