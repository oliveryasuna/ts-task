import {defineConfig} from '@oliveryasuna/tsdown-config';

export default defineConfig(
  'library',
  {
    entry: 'src/index.ts',
    tsconfig: './tsconfig.build.json',
    format: 'esm',
    fixedExtension: false
  }
);
