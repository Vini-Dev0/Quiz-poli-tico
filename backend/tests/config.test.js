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
  TRUST_PROXY: '1',
  SEO_URL: '', SEO_INDEXING_ENABLED: '', GOOGLE_SITE_VERIFICATION: ''
};
const check = overrides => spawnSync(process.execPath, ['--input-type=module', '-e', 'import { config } from "./src/config.js"; console.log(JSON.stringify({port:config.port, production:config.production, cookie:config.adminCookie, appUrl:config.appUrl, appUrls:config.appUrls, seoUrl:config.seoUrl, seoIndexingEnabled:config.seoIndexingEnabled}));'], { cwd: new URL('..', import.meta.url), env: { ...env, ...overrides }, encoding: 'utf8' });
test('produção funciona somente com variáveis em runtime, sem arquivo .env', () => {
  const result = check({});
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { port: 3000, production: true, cookie: '__Host-prisma_admin', appUrl: 'https://quiz.example.com', appUrls: ['https://quiz.example.com'], seoUrl: 'https://quiz.example.com', seoIndexingEnabled: true });
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
test('APP_URL aceita as duas origens HTTP em desenvolvimento', () => {
  const result = check({ NODE_ENV: 'development', APP_URL: 'http://localhost:3000,http://example.example' });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.appUrl, 'http://localhost:3000');
  assert.deepEqual(config.appUrls, ['http://localhost:3000', 'http://example.example']);
});
test('lista normaliza espaços, barras finais e duplicatas, mantendo a ordem', () => {
  const result = check({ APP_URL: ' https://QUIZ.example.com/, https://example.example/ , https://quiz.example.com ' });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.appUrl, 'https://quiz.example.com');
  assert.deepEqual(config.appUrls, ['https://quiz.example.com', 'https://example.example']);
});
test('valida todas as URLs e recusa entradas vazias, credenciais ou HTTP em produção', () => {
  for (const APP_URL of [
    'https://quiz.example.com,http://example.example',
    'https://quiz.example.com,https://example.example/admin',
    'https://quiz.example.com,https://example.example/?preview=1',
    'https://quiz.example.com,https://example.example/#preview',
    'https://quiz.example.com,https://user:secret@example.example',
    'https://quiz.example.com,ftp://example.example',
    'https://quiz.example.com,invalid',
    'https://quiz.example.com,',
    ',https://quiz.example.com',
    'https://quiz.example.com,,https://example.example'
  ]) assert.notEqual(check({ APP_URL }).status, 0, APP_URL);
});
test('SEO ignora localhost por padrão e aceita escolher o domínio principal permitido', () => {
  const automatic = check({ NODE_ENV: 'development', APP_URL: 'http://localhost:3000,https://ladopolitico.online' });
  assert.equal(automatic.status, 0, automatic.stderr);
  assert.equal(JSON.parse(automatic.stdout).seoUrl, 'https://ladopolitico.online');
  assert.equal(JSON.parse(automatic.stdout).seoIndexingEnabled, false);
  const selected = check({ APP_URL: 'https://quiz.example.com,https://ladopolitico.online', SEO_URL: 'https://ladopolitico.online/' });
  assert.equal(selected.status, 0, selected.stderr);
  assert.equal(JSON.parse(selected.stdout).seoUrl, 'https://ladopolitico.online');
  assert.notEqual(check({ SEO_URL: 'https://evil.example' }).status, 0);
  assert.notEqual(check({ SEO_URL: 'https://quiz.example.com/admin' }).status, 0);
});
test('homologação pode desligar indexação, e token de verificação não aceita HTML', () => {
  const staging = check({ SEO_INDEXING_ENABLED: 'false' });
  assert.equal(staging.status, 0, staging.stderr);
  assert.equal(JSON.parse(staging.stdout).seoIndexingEnabled, false);
  const localhost = check({ NODE_ENV: 'development', APP_URL: 'http://localhost:3000', SEO_INDEXING_ENABLED: 'true' });
  assert.equal(localhost.status, 0, localhost.stderr);
  assert.equal(JSON.parse(localhost.stdout).seoIndexingEnabled, false);
  assert.notEqual(check({ SEO_INDEXING_ENABLED: 'invalid' }).status, 0);
  assert.notEqual(check({ GOOGLE_SITE_VERIFICATION: '"><script>alert(1)</script>' }).status, 0);
  assert.equal(check({ GOOGLE_SITE_VERIFICATION: 'valid_google-verification-token' }).status, 0);
});
