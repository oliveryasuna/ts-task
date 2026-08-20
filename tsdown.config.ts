import {defineConfig} from '@oliveryasuna/tsdown-config';

export default defineConfig(
  'node',
  {
    entry: {
      index: 'src/index.ts',
      cli: 'src/cli.ts'
    },
    format: 'esm',
    target: 'node22',
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
    },
    outputOptions: {banner: (chunk => ((chunk.name === 'cli') ? '#!/usr/bin/env node' : ''))}
  }
);
