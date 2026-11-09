import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.turbo/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
  { files: ['apps/web/src/**/*.{ts,tsx}'], languageOptions: { globals: globals.browser } },
  {
    files: [
      'packages/*/src/**/*.ts',
      'apps/cli/src/**/*.ts',
      'apps/server/src/**/*.ts',
      'apps/web/src/**/*.{ts,tsx}',
    ],
    extends: tseslint.configs.recommendedTypeChecked,
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
);
