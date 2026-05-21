import type {NextConfig} from 'next';
const nextConfig: NextConfig = {
  transpilePackages: ['@anvil/auth', '@anvil/ui', '@anvil/notifications'],
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        {key: 'Cross-Origin-Embedder-Policy', value: 'require-corp'},
        {key: 'Cross-Origin-Opener-Policy', value: 'same-origin'},
        {key: 'Cross-Origin-Resource-Policy', value: 'cross-origin'},
      ],
    }];
  },
};
export default nextConfig;
