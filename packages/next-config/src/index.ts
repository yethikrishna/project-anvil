/**
 * @anvil/next-config — Shared Next.js configuration for all Anvil apps
 *
 * Provides:
 * - Turbopack enabled for dev (ready for Next.js 16 default)
 * - React Compiler (experimental, auto-memoization)
 * - Common transpile packages
 * - Shared webpack/turbopack aliases
 */

import type {NextConfig} from 'next';

export interface AnvilNextConfigOptions {
  /** Additional packages to transpile */
  transpilePackages?: string[];
  /** App-specific config overrides */
  overrides?: NextConfig;
}

const BASE_TRANSPILE_PACKAGES = [
  '@anvil/auth',
  '@anvil/ui',
  '@anvil/notifications',
];

export function createAnvilNextConfig(options: AnvilNextConfigOptions = {}): NextConfig {
  const transpilePackages = [
    ...BASE_TRANSPILE_PACKAGES,
    ...(options.transpilePackages ?? []),
  ];

  const config: NextConfig = {
    transpilePackages,

    // Turbopack configuration (ready for Next.js 16)
    experimental: {
      // React Compiler — automatic memoization of components
      // Removes need for manual useMemo/useCallback in most cases
      reactCompiler: true,

      // Turbopack for dev server (becomes default in Next.js 16)
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

    // Merge app-specific overrides
    ...options.overrides,
  };

  return config;
}
