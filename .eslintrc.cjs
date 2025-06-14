module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  globals: {
    NodeJS: 'readonly',
    vi: 'readonly',
  },
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'off', // Allow console.log for debugging
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '.turbo/',
    '*.js.map',
    '*.d.ts',
  ],
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: [
        'eslint:recommended',
      ],
      rules: {
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-explicit-any': 'off', // Allow any for now
        '@typescript-eslint/no-non-null-assertion': 'off', // Allow non-null assertions for now
        'no-case-declarations': 'off', // Allow lexical declarations in case blocks
      },
    },
  ],
}; 