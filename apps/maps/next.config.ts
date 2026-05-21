import {createAnvilNextConfig} from '@anvil/next-config';
export default createAnvilNextConfig({
  transpilePackages: ['maplibre-gl', 'supercluster'],
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
