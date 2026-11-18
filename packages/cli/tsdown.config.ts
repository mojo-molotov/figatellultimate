import { defineConfig, type UserConfig } from 'tsdown';

const config: UserConfig = defineConfig({
  entry: ['src/index.ts', 'src/bin.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  dts: true,
  // The package is `"type": "module"`: plain `.js` / `.d.ts`, like the other packages.
  fixedExtension: false,
});

export default config;
