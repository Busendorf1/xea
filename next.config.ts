import { withSentryConfig } from "@sentry/nextjs";

const nextConfig = {
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    domains: ["udgaognmnfsiwvvqvxdq.supabase.co", "hlhzlieeqcifcohqdmce.supabase.co", "lh3.googleusercontent.com", "s.gravatar.com"],
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
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
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
  webpack: (config: any) => {
    config.resolve.fallback = { fs: false, path: false };
    config.module.exprContextCritical = false;
    return config;
  },
};

export default withSentryConfig(nextConfig, {
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
});
