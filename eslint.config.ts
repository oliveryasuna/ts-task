import {defineConfig} from '@oliveryasuna/eslint-config';

export default defineConfig(
  {
    ignores: (defaults => [
      ...defaults,
      'README.md',
      '*git-ignore*',
      'plugins/**/*'
    ]),
    javascript: {
      globals: {
        Bun: 'readonly',
        NodeJS: 'readonly'
      }
    },
    jsdoc: {overrides: {'jsdoc/tag-lines': 'off'}},
    typescript: {
      typeAware: true,
      tsconfigRootDir: import.meta.dirname,
      overrides: {
        '@typescript-eslint/method-signature-style': [
          'error',
          'method'
        ]
      }
    }
  }
);
