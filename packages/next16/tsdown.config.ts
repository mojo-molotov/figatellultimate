import { defineConfig, type UserConfig } from 'tsdown';

const config: UserConfig = defineConfig({
  entry: [
    'src/index.ts',
    'src/facets.ts',
    'src/config.ts',
    'src/listing-index.ts',
    'src/build.ts',
    'src/images.ts',
    'src/themes.ts',
  ],
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  fixedExtension: false,
});

export default config;
