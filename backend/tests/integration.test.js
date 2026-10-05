import 'dotenv/config';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

// Exige URL própria. Nunca limpar o banco da aplicação ou produção.
if (!process.env.TEST_DATABASE_URL || !/[?&]schema=quiz_test(?:&|$)/.test(process.env.TEST_DATABASE_URL)) throw new Error('Defina TEST_DATABASE_URL apontando para schema=quiz_test e execute as migrations nele.');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.APP_URL = 'http://localhost:3000';
process.env.ADMIN_PASSWORD = 'integration-test-password';
process.env.JWT_SECRET = 'integration-test-secret-at-least-32-characters';
const { app } = await import('../src/app.js');
const { prisma } = await import('../src/services/database.js');
const { sweepAbandoned } = await import('../src/services/abandonment.js');
const { questions } = await import('../src/data/questions.js');
const { calculateResult } = await import('../src/utils/scoring.js');
const client = request(app);
const admin = request.agent(app);
const answers = Object.fromEntries(questions.map(q => [q.id, 3 + 2 * (q.axes.economic || -q.axes.authority)]));
const sessions = [];
async function start() { const res = await client.post('/api/quiz/start').expect(201); sessions.push(res.body); return res.body; }
before(async () => { await prisma.$connect(); await prisma.quizSession.deleteMany(); await prisma.adminSession.deleteMany(); });
after(async () => { await prisma.quizSession.deleteMany(); await prisma.adminSession.deleteMany(); await prisma.$disconnect(); });

test('admin protegida, login inválido, origem externa bloqueada', async () => {
  for (const path of ['stats', 'results', 'distribution', 'scatter']) await client.get(`/api/admin/${path}`).expect(401);
  await client.post('/api/admin/logout').expect(401);
  await client.get('/admin').expect(302).expect('Location', '/admin/login');
  await client.get('/admin.html').expect(404);
  await client.post('/api/admin/login').send({ password: 'wrong-password' }).expect(401);
  await client.post('/api/admin/login').set('Origin', 'https://evil.example').send({ password: process.env.ADMIN_PASSWORD }).expect(403);
  const res = await admin.post('/api/admin/login').send({ password: process.env.ADMIN_PASSWORD }).expect(200);
  assert.match(res.headers['set-cookie'][0], /HttpOnly/);
  assert.match(res.headers['set-cookie'][0], /SameSite=Strict/);
  await admin.get('/admin').expect(200);
});
test('catálogo e criação anônima com UUID v4 e chave de edição', async () => {
  const catalogue = await client.get('/api/quiz/questions').expect(200);
  assert.equal(catalogue.body.questions.length, 40);
  assert.equal(catalogue.body.questions[0].axes, undefined);
  const s = await start();
  assert.match(s.uuid, /^[a-f0-9-]{14}4/);
  assert.equal(s.token.length, 43);
  assert.equal(s.id, undefined);
  await client.get(`/api/results/${s.uuid}`).expect(404);
  await client.patch(`/api/quiz/${s.uuid}/progress`).send({ currentQuestion: 1, answers: { 1: 5 } }).expect(403);
  await client.get(`/api/quiz/${s.uuid}`).set('X-Quiz-Token', 'wrong-token').expect(403);
  await client.patch('/api/quiz/1/progress').send({}).expect(400);
});
test('progresso persistido, timestamp e retomada após abandono', async () => {
  const s = sessions[0];
  const partial = Object.fromEntries(Object.entries(answers).slice(0, 23));
  await client.patch(`/api/quiz/${s.uuid}/progress`).set('X-Quiz-Token', s.token).send({ currentQuestion: 23, answers: partial }).expect(200);
  await prisma.quizSession.update({ where: { uuid: s.uuid }, data: { lastActivityAt: new Date(Date.now() - 31 * 60_000) } });
  assert.equal(await sweepAbandoned(), 1);
  let db = await prisma.quizSession.findUnique({ where: { uuid: s.uuid } });
  assert.equal(db.status, 'ABANDONED');
  await client.patch(`/api/quiz/${s.uuid}/progress`).set('X-Quiz-Token', s.token).send({ currentQuestion: 24, answers: partial }).expect(200);
  db = await prisma.quizSession.findUnique({ where: { uuid: s.uuid } });
  assert.equal(db.status, 'STARTED');
  assert.ok(db.lastActivityAt > new Date(Date.now() - 5000));
  const resume = await client.get(`/api/quiz/${s.uuid}`).set('X-Quiz-Token', s.token).expect(200);
  assert.deepEqual(resume.body.answers, partial);
  assert.equal(resume.body.editTokenHash, undefined);
});
test('conclusão valida 40 respostas, calcula no servidor, é imutável e idempotente', async () => {
  const s = await start();
  await client.post(`/api/quiz/${s.uuid}/complete`).set('X-Quiz-Token', s.token).send({ answers: { 1: 3 } }).expect(400);
  const invalid = { ...answers, 40: 7 };
  await client.post(`/api/quiz/${s.uuid}/complete`).set('X-Quiz-Token', s.token).send({ answers: invalid }).expect(400);
  const res = await client.post(`/api/quiz/${s.uuid}/complete`).set('X-Quiz-Token', s.token).send({ answers, economicScore: -999, authorityScore: 999 }).expect(200);
  assert.equal(res.body.economicScore, 100);
  assert.equal(res.body.authorityScore, -100);
  assert.equal(res.body.politicalLabel, 'Direita Libertária');
  const again = await client.post(`/api/quiz/${s.uuid}/complete`).set('X-Quiz-Token', s.token).send({ answers: Object.fromEntries(questions.map(q => [q.id, 3])) }).expect(200);
  assert.equal(again.body.economicScore, 100);
  await client.patch(`/api/quiz/${s.uuid}/progress`).set('X-Quiz-Token', s.token).send({ currentQuestion: 40, answers }).expect(409);
  await prisma.quizSession.update({ where: { uuid: s.uuid }, data: { lastActivityAt: new Date(Date.now() - 40 * 60_000) } });
  await sweepAbandoned();
  assert.equal((await prisma.quizSession.findUnique({ where: { uuid: s.uuid } })).status, 'COMPLETED');
});
test('resultado público contém apenas resultado e SSR entrega Open Graph personalizado', async () => {
  const s = sessions[1];
  const res = await client.get(`/api/results/${s.uuid}`).expect(200);
  for (const key of ['id', 'answers', 'editTokenHash', 'lastActivityAt', 'shared']) assert.equal(res.body[key], undefined);
  const html = await client.get(`/resultado/${s.uuid}`).expect(200);
  assert.match(html.text, /og:title" content="Meu resultado: Direita Libertária/);
  assert.match(html.text, /og:url/);
  assert.doesNotMatch(html.text, /<!--RESULT_META-->/);
  await client.get(`/resultado/${s.uuid}/card.svg`).expect(200).expect('Content-Type', /image\/svg\+xml/);
  await client.get(`/api/results/${randomUUID()}`).expect(404);
});
test('compartilhamento idempotente e proibido antes de concluir', async () => {
  await client.post(`/api/quiz/${sessions[0].uuid}/share`).expect(404);
  const s = sessions[1];
  await client.post(`/api/quiz/${s.uuid}/share`).expect(200);
  const first = await prisma.quizSession.findUnique({ where: { uuid: s.uuid } });
  await client.post(`/api/quiz/${s.uuid}/share`).expect(200);
  const again = await prisma.quizSession.findUnique({ where: { uuid: s.uuid } });
  assert.equal(first.sharedAt.getTime(), again.sharedAt.getTime());
  assert.equal(again.shared, true);
});
test('estatísticas, filtros, distribuições, scatter e paginação usam o banco real', async () => {
  const s = await start();
  await prisma.quizSession.update({ where: { uuid: s.uuid }, data: { lastActivityAt: new Date(Date.now() - 31 * 60_000) } });
  const s2 = await start();
  await client.post(`/api/quiz/${s2.uuid}/complete`).set('X-Quiz-Token', s2.token).send({ answers: Object.fromEntries(questions.map(q => [q.id, 3])) }).expect(200);
  const stats = await admin.get('/api/admin/stats').expect(200);
  assert.deepEqual(stats.body, { started: 4, total: 4, completed: 2, abandoned: 1, shared: 1, notShared: 1, active: 1, completionRate: 50, abandonmentRate: 25, shareRate: 50 });
  const distribution = await admin.get('/api/admin/distribution').expect(200);
  assert.equal(distribution.body.economic.reduce((sum, item) => sum + item.count, 0), 2);
  assert.equal(distribution.body.authority.find(item => item.label === 'Libertário radical').count, 1);
  const filtered = await admin.get('/api/admin/results?economic=right&authority=libertarian&shared=yes').expect(200);
  assert.equal(filtered.body.total, 1);
  assert.equal(filtered.body.data[0].uuid, sessions[1].uuid);
  const notShared = await admin.get('/api/admin/results?shared=no').expect(200);
  assert.equal(notShared.body.total, 1);
  assert.equal(notShared.body.data[0].status, 'COMPLETED');
  const scatter = await admin.get('/api/admin/scatter?limit=1&page=2').expect(200);
  assert.equal(scatter.body.totalPages, 2);
  assert.deepEqual(Object.keys(scatter.body.data[0]).sort(), ['authorityScore', 'economicScore']);
  const pagination = await admin.get('/api/admin/results?page=2&limit=1&sort=economic').expect(200);
  assert.equal(pagination.body.totalPages, 4);
  assert.equal(pagination.body.data.length, 1);
  await admin.get('/api/admin/results?limit=101').expect(400);
  await admin.get('/api/admin/results?status=invalid').expect(400);
});
test('progressos e conclusão simultâneos não rebaixam resultado', async () => {
  const s = await start();
  const responses = await Promise.all([
    client.post(`/api/quiz/${s.uuid}/complete`).set('X-Quiz-Token', s.token).send({ answers }),
    client.patch(`/api/quiz/${s.uuid}/progress`).set('X-Quiz-Token', s.token).send({ currentQuestion: 40, answers })
  ]);
  assert.equal(responses[0].status, 200);
  assert.ok([200, 409].includes(responses[1].status));
  const db = await prisma.quizSession.findUnique({ where: { uuid: s.uuid } });
  assert.equal(db.status, 'COMPLETED');
  assert.equal(db.economicScore, calculateResult(answers).economicScore);
});
test('logout revoga sessão no banco e token anterior não pode ser reutilizado', async () => {
  const freshLogin = await client.post('/api/admin/login').send({ password: process.env.ADMIN_PASSWORD }).expect(200);
  const cookie = freshLogin.headers['set-cookie'][0].split(';')[0];
  await client.post('/api/admin/logout').set('Cookie', cookie).expect(200);
  await client.get('/api/admin/stats').set('Cookie', cookie).expect(401);
  await admin.post('/api/admin/logout').expect(200);
  await admin.get('/api/admin/stats').expect(401);
});
