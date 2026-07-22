import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ["udgaognmnfsiwvvqvxdq.supabase.co", "hlhzlieeqcifcohqdmce.supabase.co", "lh3.googleusercontent.com", "s.gravatar.com"],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config: any) => {
    config.resolve.fallback = { fs: false, path: false };
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
