import { defineConfig, type UserConfig } from 'tsdown';

const config: UserConfig = defineConfig({
  entry: ['src/index.ts', 'src/config.ts', 'src/images.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  dts: true,
  // The package is `"type": "module"`: plain `.js` / `.d.ts`, like core.
  fixedExtension: false,
});

export default config;
