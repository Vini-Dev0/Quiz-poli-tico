import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const env = {
  ...process.env,
  DOTENV_CONFIG_PATH: '/nonexistent/prisma-quiz-test.env',
  NODE_ENV: 'production',
  APP_URL: 'https://quiz.example.com',
  PORT: '3000',
  DATABASE_URL: 'postgresql://quiz:test-password@database:5432/quiz?schema=public',
  ADMIN_PASSWORD: 'strong-admin-test-password',
  JWT_SECRET: 'test-jwt-secret-with-at-least-32-characters',
  ABANDONMENT_MINUTES: '30',
  TRUST_PROXY: '1'
};
const check = overrides => spawnSync(process.execPath, ['--input-type=module', '-e', 'import { config } from "./src/config.js"; console.log(JSON.stringify({port:config.port, production:config.production, cookie:config.adminCookie}));'], { cwd: new URL('..', import.meta.url), env: { ...env, ...overrides }, encoding: 'utf8' });
test('produção funciona somente com variáveis em runtime, sem arquivo .env', () => {
  const result = check({});
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { port: 3000, production: true, cookie: '__Host-prisma_admin' });
});
test('produção recusa HTTP e APP_URL com caminhos', () => {
  for (const APP_URL of ['http://quiz.example.com', 'https://quiz.example.com/admin', 'https://quiz.example.com/?preview=1']) assert.notEqual(check({ APP_URL }).status, 0);
});
test('configuração inválida falha sem imprimir senha ou URL do banco', () => {
  const password = 'this-database-password-must-not-be-logged';
  const result = check({ DATABASE_URL: `https://quiz:${password}@database/quiz` });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DATABASE_URL deve ser uma URL/);
  assert.doesNotMatch(result.stderr, new RegExp(password));
  for (const PORT of ['0', '65536', '3000.5', 'invalid']) assert.notEqual(check({ PORT }).status, 0);
  assert.notEqual(check({ ADMIN_PASSWORD: '' }).status, 0);
  assert.notEqual(check({ JWT_SECRET: 'short-secret' }).status, 0);
});
