import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const result = spawnSync(process.execPath, ['backend/node_modules/eslint/bin/eslint.js', '--config', 'eslint.config.mjs', 'backend/src', 'backend/scripts', 'backend/tests', 'frontend/js'], { cwd: root, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
