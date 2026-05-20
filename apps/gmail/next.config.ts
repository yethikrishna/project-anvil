import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@anvil/auth', '@anvil/ui', '@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-placeholder', '@tiptap/pm', '@tiptap/core'],
};

export default nextConfig;
