import { withSentryConfig } from "@sentry/nextjs";
try {
  const dns = require("dns");
  if (dns && typeof dns.setDefaultResultOrder === "function") {
    dns.setDefaultResultOrder("ipv4first");
  }
} catch {}

const nextConfig = {
  serverExternalPackages: ["ioredis", "bullmq", "@clickhouse/client"],
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "*.gravatar.com" },
    ],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  async rewrites() {
    return [
      {
        source: "/cdn/storage/:path*",
        destination: "/api/media/:path*",
      },
    ];
  },
  async headers() {
    const cspHeader = `
      default-src 'self';
      script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://cdn.auth0.com;
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: blob: https:;
      media-src 'self' blob: data: https:;
      font-src 'self' data:;
      connect-src 'self' https: wss:;
      frame-src 'self' https://challenges.cloudflare.com https://checkout.paystack.com;
      worker-src 'self' blob:;
      object-src 'none';
      base-uri 'self';
      form-action 'self' https://*.auth0.com;
    `
      .replace(/\s{2,}/g, " ")
      .trim();

    return [
      {
        source: "/cdn/storage/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=86400, immutable",
          },
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader,
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  webpack: (config: any, { isServer }: any) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        dns: false,
        net: false,
        tls: false,
      };
    }
    config.module.exprContextCritical = false;
    return config;
  },
};

const isSentryConfigured = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_AUTH_TOKEN || process.env.SENTRY_DSN);

export default isSentryConfigured
  ? withSentryConfig(nextConfig, {
      org: "paayh",
      project: "javascript-nextjs",
      silent: !process.env.CI,
      widenClientFileUpload: true,
      tunnelRoute: "/monitoring",
      webpack: {
        treeshake: {
          removeDebugLogging: true,
        },
        automaticVercelMonitors: true,
      },
      sourcemaps: {
        deleteSourcemapsAfterUpload: true,
      },
    })
  : nextConfig;
