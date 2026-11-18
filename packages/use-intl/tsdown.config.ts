import { defineConfig, type UserConfig } from 'tsdown';

const config: UserConfig = defineConfig({
  entry: ['src/index.ts', 'src/react.ts', 'src/precompile.ts', 'src/format.ts'],
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  fixedExtension: false,
});

export default config;
