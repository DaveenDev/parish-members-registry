// ESLint for the client (npm run lint). The rules that catch real bugs are
// errors: hooks called conditionally, undefined names, unreachable code.
// The ones that are about taste are off, so the output stays worth reading.
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      // Props are documented in comments, not PropTypes.
      'react/prop-types': 'off',
      // Plain apostrophes and quotes in text read fine and are everywhere.
      'react/no-unescaped-entities': 'off',
      // `try { … } catch {}` around storage and scrolling is deliberate.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Unused imports and variables, but not `_`-prefixed ones, the rest of a
      // destructure, or the `import React` every file starts with.
      'no-unused-vars': ['warn', { varsIgnorePattern: '^(_|React$)', argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
  {
    // Tests and build config run under Node.
    files: ['test/**/*.js', '*.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
  },
];
