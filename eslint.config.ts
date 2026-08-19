import {defineConfig} from '@oliveryasuna/eslint-config';

export default defineConfig(
  {
    ignores: (defaults => [
      ...defaults,
      '*git-ignore*'
    ]),
    javascript: {globals: {Bun: 'readonly'}},
    jsdoc: {overrides: {'jsdoc/tag-lines': 'off'}},
    typescript: {
      typeAware: true,
      tsconfigRootDir: import.meta.dirname
    }
  }
);
