import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: [
    '@anvil/auth',
    '@anvil/ui',
    '@anvil/notifications',
    '@anvil/fs-access',
  ],

  // Turbopack configuration (ready for Next.js 16)
  experimental: {
    // React Compiler — automatic memoization of components
    reactCompiler: true,

    // Turbopack for dev server
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  },

  // Image optimization configuration
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {protocol: 'https', hostname: '**.googleapis.com'},
      {protocol: 'https', hostname: '**.google.com'},
      {protocol: 'https', hostname: 'lh3.googleusercontent.com'},
    ],
  },

  // Headers for security
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {key: 'X-Content-Type-Options', value: 'nosniff'},
          {key: 'X-Frame-Options', value: 'DENY'},
          {key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'},
        ],
      },
    ];
  },
};

export default config;
