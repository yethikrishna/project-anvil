import type {NextConfig} from 'next';
const nextConfig: NextConfig = {transpilePackages: ['@anvil/auth', '@anvil/ui', '@anvil/notifications']};
export default nextConfig;
