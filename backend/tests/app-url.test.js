import test from 'node:test';
import assert from 'node:assert/strict';

// Configuração própria: os testes não leem nem alteram o .env da aplicação.
Object.assign(process.env, {
  DOTENV_CONFIG_PATH: '/nonexistent/prisma-quiz-test.env',
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:3000,http://example.example,https://example.example',
  DATABASE_URL: 'postgresql://quiz:test@database:5432/quiz',
  ADMIN_PASSWORD: 'app-url-test-password',
  JWT_SECRET: 'app-url-test-secret-at-least-32-characters'
});
const { getAppUrl } = await import('../src/utils/app-url.js');

test('links preservam protocolo, domínio e porta de uma origem configurada', () => {
  assert.equal(getAppUrl({ protocol: 'http', host: 'localhost:3000' }), 'http://localhost:3000');
  assert.equal(getAppUrl({ protocol: 'http', host: 'example.example' }), 'http://example.example');
  assert.equal(getAppUrl({ protocol: 'https', host: 'example.example:443' }), 'https://example.example');
});
test('host ou protocolo não autorizado usa a primeira URL sem refletir dados externos', () => {
  for (const req of [
    { protocol: 'http', host: 'evil.example' },
    { protocol: 'https', host: 'localhost:3000' },
    { protocol: 'http', host: 'example.example.evil.example' },
    { protocol: 'http', host: 'example.example:3000' },
    { protocol: 'ftp', host: 'example.example' }
  ]) assert.equal(getAppUrl(req), 'http://localhost:3000');
});
test('host ausente ou malformado não produz URL pública inválida', () => {
  for (const host of [undefined, '', 'bad host', 'user:secret@example.example', 'example.example/resultado', 'example.example?query=1', 'example.example#fragment']) {
    assert.equal(getAppUrl({ protocol: 'http', host }), 'http://localhost:3000');
  }
});
