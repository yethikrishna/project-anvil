import {createAnvilNextConfig} from '@anvil/next-config';
export default createAnvilNextConfig({
  overrides: {
    reactCompiler: true,
    turbopack: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  },
});
