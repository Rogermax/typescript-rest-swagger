module.exports = {
  extends: ['standard-with-typescript', "prettier"],
  parserOptions: {
    project: './tsconfig.json'
  },
  rules: {
    "@typescript-eslint/space-before-function-paren": 'off',
    '@typescript-eslint/prefer-nullish-coalescing': 'warn',
    '@typescript-eslint/strict-boolean-expressions': 'warn'
  }
}
