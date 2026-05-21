/**
 * @anvil/next-config — Shared Next.js configuration for all Anvil apps
 *
 * Usage:
 * - Next 15 apps (default): createAnvilNextConfig()
 * - Next 16 apps: createAnvilNextConfig({ overrides: { reactCompiler: true, turbopack: {...} } })
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

  // Default experimental config for Next 15 apps
  // Next 16 apps should override with top-level reactCompiler + turbopack
  const hasOverrides = options.overrides !== undefined;
  const experimental = hasOverrides ? undefined : {
    reactCompiler: true,
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  };

  const config: NextConfig = {
    transpilePackages,

    ...(experimental ? { experimental } : {}),

    // Image optimization
    images: {
      formats: ['image/avif', 'image/webp'],
      remotePatterns: [
        {protocol: 'https', hostname: '**.googleapis.com'},
        {protocol: 'https', hostname: '**.google.com'},
        {protocol: 'https', hostname: 'lh3.googleusercontent.com'},
      ],
    },

    // Security headers
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

    ...options.overrides,
  };

  return config;
}
