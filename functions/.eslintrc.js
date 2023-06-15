module.exports = {
  env: {
    es6: true,
    browser: true,
    mocha: true,
    node: true,
  },
  parserOptions: {
    "sourceType": "module",
    "ecmaVersion": 11,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "error",
    "max-len": ["warn", {code: 160}],
    "require-jsdoc": 0,
    "no-control-regex": 0,
    "quotes": ["error", "double", {"allowTemplateLiterals": true}],
  },
  overrides: [
    {
      files: ["**/*.spec.*"],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  globals: {},
};
