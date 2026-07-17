import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD === "true" ? "standalone" : undefined,
  allowedDevOrigins: ["192.168.100.19", "10.36.90.18", "localhost"],
};

export default nextConfig;