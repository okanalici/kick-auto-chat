import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '.kilo/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}', 'extension/*.js'],
    ignores: ['vite.config.ts'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['extension/*.js'],
    languageOptions: {
      globals: { chrome: 'readonly', __KICK_EMOJIS__: 'readonly' },
    },
  },
  {
    files: ['tests/**/*.mjs', '*.config.mjs', 'vite.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
);
