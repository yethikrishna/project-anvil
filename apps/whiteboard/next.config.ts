import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@anvil/auth', '@anvil/ui', '@anvil/notifications'],

  experimental: {
    reactCompiler: true,
  },

  // Excalidraw requires some webpack adjustments
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        encoding: false,
        'supports-color': false,
      };
    }
    return config;
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default config;
