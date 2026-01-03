import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable standalone output for custom server
  output: 'standalone',

  // Disable built-in server (we use custom server.ts)
  // This is needed because we integrate Socket.io

  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // Webpack config for xterm.js compatibility
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

export default nextConfig;
