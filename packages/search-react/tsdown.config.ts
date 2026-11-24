import { defineConfig, type UserConfig } from 'tsdown';

const config: UserConfig = defineConfig({
  entry: ['src/index.ts', 'src/scripts.ts'],
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  // One file per module: each keeps its own 'use client', so that an app ships only the client parts it renders.
  unbundle: true,
  fixedExtension: false,
});

export default config;
