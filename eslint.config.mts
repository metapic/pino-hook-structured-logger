import metapic from '@metapic/eslint-config'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  {
    extends: [metapic.configs.recommended],
    rules: {
      'import/no-relative-parent-imports': 'off',
      'prettier/prettier': [
        'error',
        {
          semi: false,
          tabWidth: 2,
          singleQuote: true,
          printWidth: 80,
          trailingComma: 'all',
        },
      ],
    },
  },
])
