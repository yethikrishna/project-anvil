import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@anvil/auth', '@anvil/ui', 'maplibre-gl', 'supercluster'],
};

export default nextConfig;
