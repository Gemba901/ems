import type { NextConfig } from "next";
import withPWA from "next-pwa";

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD === "true" ? "standalone" : undefined,
  allowedDevOrigins: ["192.168.100.19", "10.36.90.18", "localhost", "*.localhost"],
  turbopack: {},
  outputFileTracingIncludes: {
    "/api/docs/dwms/*": [
      "./content/dwms-docs/*.md",
      "./content/dwms-docs-images/**/*.png",
    ],
  },
};

const pwaConfig = withPWA({
  dest: "public/sw",
  disable: process.env.NODE_ENV !== "production",
  register: true,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [{ urlPattern: /\/api\//, handler: "NetworkOnly" }],
});

export default pwaConfig(nextConfig);
