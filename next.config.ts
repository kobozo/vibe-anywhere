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

  // Mark ssh2 and related modules as external (server-only)
  serverExternalPackages: ['ssh2', 'cpu-features'],

  // Webpack config for xterm.js and ssh2 compatibility
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    // Exclude ssh2 and native modules from client bundle
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'ssh2': false,
        'cpu-features': false,
      };
    }

    return config;
  },
};

export default nextConfig;
