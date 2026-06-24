// import type { NextConfig } from "next";

// const nextConfig: NextConfig = {
//   /* config options here */
//   devIndicators: false
// };

// export default nextConfig;


/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ["udgaognmnfsiwvvqvxdq.supabase.co", "hlhzlieeqcifcohqdmce.supabase.co", "lh3.googleusercontent.com", "s.gravatar.com"], // Use your actual Supabase storage domain
  },

  typescript: {
    // Ignore TypeScript errors during the build
    ignoreBuildErrors: true,
  },
  eslint: {
    // Ignore ESLint errors during the build
    ignoreDuringBuilds: true,
  },
  webpack: (config: any) => {
    config.resolve.fallback = { fs: false, path: false }; // Add necessary fallbacks
    return config;
  },
  // Add any other configurations here
};

export default nextConfig;
