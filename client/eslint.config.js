import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // shadcn/ui primitives intentionally co-locate their cva() variant definitions with the component
    // (e.g. buttonVariants in button.tsx). cva() results aren't recognised as "constants" by the
    // fast-refresh rule, so it complains — but these files barely change, so the fast-refresh trade-off
    // is a non-issue. Turn the rule off for the ui/ folder rather than split every primitive.
    files: ['**/components/ui/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
