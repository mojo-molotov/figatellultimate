import { defineConfig, type UserConfig } from 'tsdown';

// One entry; the glow and the sparkles become chunks of their own, fetched on demand by `Effects`.
const config: UserConfig = defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  fixedExtension: false,
});

export default config;
