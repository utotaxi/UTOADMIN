import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production optimizations
  poweredByHeader: false, // Remove X-Powered-By header for security
  compress: true, // Enable gzip compression
  
  // Image optimization - allow Supabase storage images
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "tadqvfnqykmjdxzpoczp.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },

  // Strict mode for better React error detection in dev
  reactStrictMode: true,
};

export default nextConfig;
