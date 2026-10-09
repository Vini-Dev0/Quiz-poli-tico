import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('./backend/package.json', import.meta.url));
const globals = require('globals');
export default [
  { ignores: ['**/node_modules/**', 'test-results/**'] },
  { basePath: fileURLToPath(new URL('./',import.meta.url)), files: ['backend/**/*.js', 'frontend/js/*.js'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser } }, rules: { 'no-undef': 'error', 'no-unreachable': 'error', 'no-duplicate-imports': 'error', 'no-constant-condition': 'error', 'valid-typeof': 'error', 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }] } }
];
