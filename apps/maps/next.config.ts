import {createAnvilNextConfig} from '@anvil/next-config';
export default createAnvilNextConfig({
  transpilePackages: ['maplibre-gl', 'supercluster'],
});
