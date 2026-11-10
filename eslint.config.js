import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// 分層規則：domain 是純邏輯，不得依賴 React、store、設備實作或 UI。
// device 不得依賴 store 或 UI。違反時 lint 會直接失敗，避免架構慢慢走樣。
const restrictImports = (patterns, message) => [
  'error',
  { patterns: [{ group: patterns, message }] },
];

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-console': 'error',
      eqeqeq: 'error',
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictImports(
        ['react', 'react-dom', 'zustand', 'zustand/*', '**/device/**', '**/stores/**', '**/app/**'],
        'domain 只能放純邏輯，不可依賴 React、store、設備或 UI。',
      ),
    },
  },
  {
    files: ['src/device/**/*.ts'],
    rules: {
      'no-restricted-imports': restrictImports(
        ['react', 'react-dom', 'zustand', 'zustand/*', '**/stores/**', '**/app/**', '**/pages/**'],
        'device 層不可依賴 React、store 或 UI。',
      ),
    },
  },
  {
    files: ['src/pages/**/*.tsx', 'src/components/**/*.tsx', 'src/app/**/*.tsx'],
    rules: {
      'no-restricted-imports': restrictImports(
        ['**/device/mock/**', '**/device/ble/**'],
        'UI 不可直接使用設備實作，請透過 stores。',
      ),
    },
  },
);
