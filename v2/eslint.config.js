import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  { ignores: ['dist', 'coverage', '*.config.js', 'src-tauri'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // Prevents new bare Chinese string literals in component <script> blocks.
      // Use $t() for i18n keys, or lng(zh, en) from useLang for dynamic text.
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "Literal[value=/[\\u4e00-\\u9fff\\u3400-\\u4dbf]/]" +
            ":not(CallExpression[callee.name='lng'] > .arguments)" +
            ":not(CallExpression[callee.name='t'] > .arguments)",
          message:
            "Bare Chinese string in component script — use $t('key') or lng(zh, en) instead.",
        },
      ],
    },
  },
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off',
    },
  },
  prettier,
)
