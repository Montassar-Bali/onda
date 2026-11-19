import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  // Files read from disk at runtime (PDF tickets and ticket emails). On Vercel, functions only contain
  // traced files, and /public is served by the CDN — so these must be bundled explicitly.
  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-{400,700,800}-normal.woff",
      "./public/brand/onda-logo-email.png",
      "./public/brand/tropical-bar.png",
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
