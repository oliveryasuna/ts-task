import type {UserConfig} from 'tsdown';
import {defineConfig as tsdown} from '@oliveryasuna/tsdown-config';
import {defineConfig, mergeConfig} from 'tsdown';

const base = (({
  format: 'esm',
  fixedExtension: false,
  deps: {
    neverBundle: [
      'chalk',
      'chokidar',
      'commander',
      'jiti',
      'p-limit',
      'safe-stable-stringify',
      'tinyexec'
    ]
  }
} as const) satisfies UserConfig);

export default defineConfig([
  tsdown('library', mergeConfig(base, {entry: 'src/index.ts'})),
  tsdown(
    'node',
    mergeConfig(
      base,
      {
        entry: 'src/cli.ts',
        target: 'node22',
        outputOptions: {banner: '#!/usr/bin/env node'}
      }
    )
  )
]);
