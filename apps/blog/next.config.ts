import type {NextConfig} from 'next';

const config: NextConfig = {
  transpilePackages: ['@anvil/ui', '@anvil/notifications'],
};

export default config;
