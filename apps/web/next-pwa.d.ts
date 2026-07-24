declare module "next-pwa" {
  import type { NextConfig } from "next";
  export default function withPWA(config: Record<string, unknown>): (nextConfig: NextConfig) => NextConfig;
}
