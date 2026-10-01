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
    "/api/docs/sga/*": ["./content/sga-docs/*.md"],
    "/api/docs/kaizen/*": ["./content/kaizen-docs/*.md"],
  },
  // Baseline headers for every page and proxied API response. The CSP only covers
  // directives that can't break Next.js scripts or styles; a script-src policy would need nonces.
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Strict-Transport-Security", value: "max-age=31536000" },
        // SIMS photo inputs use the camera; nothing uses the microphone or location.
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
      ],
    }];
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
