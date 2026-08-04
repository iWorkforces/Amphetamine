import { defineConfig } from '@rsbuild/core';

export default defineConfig({
  environments: {
    main: {
      source: {
        entry: { index: './src/renderer/index.ts' },
        tsconfigPath: './src/renderer/tsconfig.json',
      },
      html: {
        template: './src/renderer/index.html',
      },
    },
    settings: {
      source: {
        entry: { settings: './src/renderer/settings/index.ts' },
        tsconfigPath: './src/renderer/tsconfig.json',
      },
      html: {
        template: './src/renderer/settings/index.html',
      },
    },
    about: {
      source: {
        entry: { about: './src/renderer/about/index.ts' },
        tsconfigPath: './src/renderer/tsconfig.json',
      },
      html: {
        template: './src/renderer/about/index.html',
      },
    },
    'utility-dialog': {
      source: {
        entry: { 'utility-dialog': './src/renderer/utility-dialog/index.ts' },
        tsconfigPath: './src/renderer/tsconfig.json',
      },
      html: {
        template: './src/renderer/utility-dialog/index.html',
      },
    },
  },
  output: {
    distPath: { root: './lib/renderer' },
    assetPrefix: './',
    target: 'web',
  },
  tools: {
    bundlerChain(chain) {
      chain.target('electron-renderer');
    },
    rspack(config) {
      // electron-renderer sets global["webpackHotUpdate..."] which breaks in browser
      // Patch globalObject so HMR runtime uses globalThis instead
      if (config.output) {
        config.output.globalObject = 'globalThis';
      } else {
        config.output = { globalObject: 'globalThis' };
      }
      return config;
    },
  },
  performance: {
    chunkSplit: { strategy: 'split-by-experience' },
    removeConsole: process.env.NODE_ENV === 'production' ? true : [],
  },
});
