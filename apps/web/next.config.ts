import { withSentryConfig } from "@sentry/nextjs/config";
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

export default withSentryConfig(pwaConfig(nextConfig), {
  org: "gemba-pms",
  project: "gemba-web",
  // Only present in Vercel builds; without it the source map upload is skipped.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Send browser events via this app so ad blockers don't drop them.
  tunnelRoute: "/monitoring",
});
