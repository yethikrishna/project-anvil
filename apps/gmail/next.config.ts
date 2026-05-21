import {createAnvilNextConfig} from '@anvil/next-config';
export default createAnvilNextConfig({
  transpilePackages: ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-placeholder', '@tiptap/pm', '@tiptap/core'],
});
