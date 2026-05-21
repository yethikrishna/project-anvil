import {createAnvilNextConfig} from '@anvil/next-config';
export default createAnvilNextConfig({
  transpilePackages: ['maplibre-gl', 'supercluster', 'pmtiles', 'protomaps-themes-base'],
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
