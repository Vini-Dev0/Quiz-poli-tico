import 'dotenv/config';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

// Exige URL própria. Nunca limpar o banco da aplicação ou produção.
if (!process.env.TEST_DATABASE_URL || !/[?&]schema=quiz_test(?:&|$)/.test(process.env.TEST_DATABASE_URL)) throw new Error('Defina TEST_DATABASE_URL apontando para schema=quiz_test e execute as migrations nele.');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.APP_URL = 'http://localhost:3000,http://example.example,https://example.example';
process.env.TRUST_PROXY = '0';
process.env.SEO_URL = 'https://example.example';
process.env.SEO_INDEXING_ENABLED = 'true';
process.env.GOOGLE_SITE_VERIFICATION = 'integration-verification-token';
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
  await client.get('/pt-br/admin').expect(302).expect('Location', '/pt-br/admin/login');
  await client.get('/admin.html').expect(404);
  await client.post('/api/admin/login').send({ password: 'wrong-password' }).expect(401);
  await client.post('/api/admin/login').set('Origin', 'https://evil.example').send({ password: process.env.ADMIN_PASSWORD }).expect(403);
  const res = await admin.post('/api/admin/login').send({ password: process.env.ADMIN_PASSWORD }).expect(200);
  assert.match(res.headers['set-cookie'][0], /HttpOnly/);
  assert.match(res.headers['set-cookie'][0], /SameSite=Strict/);
  await admin.get('/pt-br/admin').expect(200);
});
test('SEO público é renderizado no servidor com canonical, JSON-LD e CSP compatíveis', async () => {
  const titles = new Set();
  for (const path of ['/pt-br/', '/pt-br/metodologia', '/pt-br/sobre', '/pt-br/privacidade', '/pt-br/perguntas-frequentes']) {
    for (const Host of ['localhost:3000', 'example.example']) {
      const response = await client.get(path).set('Host', Host).expect(200);
      assert.equal(response.headers['content-language'], 'pt-BR');
      assert.equal(response.headers['x-robots-tag'], undefined);
      assert.ok(response.text.includes(`<link rel="canonical" href="https://example.example${path}">`));
      assert.match(response.text, /<meta name="robots" content="index, follow, max-image-preview:large">/);
      assert.equal((response.text.match(/<h1\b/g) || []).length, 1);
      assert.doesNotMatch(response.text, /<!--(?:PAGE_|HOME_FAQ|ABANDONMENT_MINUTES)/);
      const [, nonce, source] = response.text.match(/<script type="application\/ld\+json" nonce="([^"]+)">([^]*?)<\/script>/);
      assert.ok(response.headers['content-security-policy'].includes(`'nonce-${nonce}'`));
      const structured = JSON.parse(source);
      assert.equal(structured['@context'], 'https://schema.org');
      const page = structured['@graph'].find(item => item['@type'] === (path === '/pt-br/sobre' ? 'AboutPage' : 'WebPage'));
      assert.equal(page.url, `https://example.example${path}`);
      if (path === '/pt-br/') {
        assert.match(response.text, /google-site-verification" content="integration-verification-token/);
        assert.match(response.text, /Como descobrir meu lado político com este quiz/);
        assert.equal(structured['@graph'].find(item => item['@type'] === 'WebSite').name, 'Prisma');
      } else assert.equal(structured['@graph'].find(item => item['@type'] === 'BreadcrumbList').itemListElement.length, 2);
      titles.add(response.text.match(/<title>(.*?)<\/title>/)[1]);
    }
  }
  assert.equal(titles.size, 5);
});
test('sitemap concentra páginas editoriais e robots permite ler noindex dos resultados', async () => {
  const sitemap = await client.get('/sitemap.xml').expect(200).expect('Content-Type', /application\/xml/);
  const urls = [...sitemap.text.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  assert.equal(urls.length,20);
  assert.ok(urls.includes('https://example.example/en/metodologia'));
  assert.ok(urls.includes('https://example.example/zh-cn/'));
  assert.doesNotMatch(sitemap.text, /resultado|admin|localhost|lastmod|changefreq/);
  const robots = await client.get('/robots.txt').expect(200).expect('Content-Type', /text\/plain/);
  assert.match(robots.text, /Sitemap: https:\/\/example\.example\/sitemap\.xml/);
  assert.doesNotMatch(robots.text, /Disallow: \/(?:resultado|css|js|assets)/);
  for (const path of ['/pt-br/admin/login', '/api/quiz/questions', '/health']) {
    const response = await client.get(path).expect(200);
    assert.match(response.headers['x-robots-tag'], /noindex/);
  }
  await client.get('/index.html').expect(302).expect('Location', '/pt-br/');
  await client.get('/pt-br/metodologia/').expect(308).expect('Location', '/pt-br/metodologia');
  await client.get('/pagina-inexistente').set('Accept', 'text/html').expect(404).expect('X-Robots-Tag', 'noindex');
});
test('HTML e CSS públicos são comprimidos e PNG de compartilhamento existe', async () => {
  for (const path of ['/pt-br/', '/css/style.css']) {
    await client.get(path).set('Accept-Encoding', 'gzip').expect(200).expect('Content-Encoding', 'gzip');
  }
  const apiResponse = await client.get('/api/quiz/questions').set('Accept-Encoding', 'gzip').expect(200);
  assert.equal(apiResponse.headers['content-encoding'], undefined);
  const image = await client.get('/assets/social-card.png').expect(200).expect('Content-Type', /image\/png/);
  assert.equal(image.body.readUInt32BE(16), 1200);
  assert.equal(image.body.readUInt32BE(20), 630);
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
  assert.deepEqual(res.body.economicView, { score: res.body.economicScore, label: res.body.economicLabel });
  assert.deepEqual(res.body.authorityView, { score: res.body.authorityScore, label: res.body.authorityLabel });
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
  assert.deepEqual(res.body.economicView, { score: res.body.economicScore, label: res.body.economicLabel });
  assert.deepEqual(res.body.authorityView, { score: res.body.authorityScore, label: res.body.authorityLabel });
  const html = await client.get(`/pt-br/resultado/${s.uuid}`).expect(200);
  assert.match(html.headers['x-robots-tag'], /noindex/);
  assert.match(html.text, /<meta name="robots" content="noindex, follow">/);
  assert.match(html.text, /og:title" content="Meu resultado: Direita Libertária/);
  assert.match(html.text, /og:url/);
  assert.doesNotMatch(html.text, /<!--RESULT_META-->/);
  const card = await client.get(`/pt-br/resultado/${s.uuid}/card.svg`).expect(200).expect('Content-Type', /image\/svg\+xml/);
  const cardText = card.text || card.body.toString('utf8');
  assert.match(cardText, /Visão econômica/);
  assert.match(cardText, /Visão de autoridade/);
  assert.match(cardText, /Libertário radical/);
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
test('ambas as origens suportam quiz, links, compartilhamento e login administrativo', async () => {
  for (const origin of ['http://localhost:3000', 'http://example.example']) {
    const headers = { Host: new URL(origin).host, Origin: origin, 'Sec-Fetch-Site': 'same-origin' };
    const started = await client.post('/api/quiz/start').set(headers).expect(201);
    const { uuid, token } = started.body;
    await client.patch(`/api/quiz/${uuid}/progress`).set(headers).set('X-Quiz-Token', token).send({ currentQuestion: 1, answers: { 1: 3 } }).expect(200);
    const completed = await client.post(`/api/quiz/${uuid}/complete`).set(headers).set('X-Quiz-Token', token).send({ answers }).expect(200);
    const url = `${origin}/resultado/${uuid}`;
    assert.equal(completed.body.resultUrl, url);
    const resumed = await client.get(`/api/quiz/${uuid}`).set(headers).set('X-Quiz-Token', token).expect(200);
    assert.equal(resumed.body.resultUrl, url);
    const html = await client.get(`/pt-br/resultado/${uuid}`).set(headers).expect(200);
    assert.ok(html.text.includes(`<link rel="canonical" href="${url.replace('/resultado/', '/pt-br/resultado/')}">`));
    assert.ok(html.text.includes(`<meta property="og:url" content="${url.replace('/resultado/', '/pt-br/resultado/')}">`));
    assert.ok(html.text.includes(`<meta property="og:image" content="${url.replace('/resultado/', '/pt-br/resultado/')}/card.svg">`));
    await client.post(`/api/quiz/${uuid}/share`).set(headers).expect(200);
    const login = await client.post('/api/admin/login').set(headers).send({ password: process.env.ADMIN_PASSWORD }).expect(200);
    assert.doesNotMatch(login.headers['set-cookie'][0], /Domain=/i);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    await client.get('/api/admin/stats').set(headers).set('Cookie', cookie).expect(200);
    await client.post('/api/admin/logout').set(headers).set('Cookie', cookie).expect(200);
  }
});
test('domínios externos continuam bloqueados e hosts desconhecidos não contaminam links', async () => {
  for (const origin of ['http://evil.example', 'http://example.example.evil.example', 'null']) {
    await client.post('/api/quiz/start').set('Origin', origin).expect(403);
  }
  await client.post('/api/quiz/start').set('Origin', 'http://example.example').set('Sec-Fetch-Site', 'cross-site').expect(403);
  const s = sessions[1];
  const fallbackUrl = `http://localhost:3000/resultado/${s.uuid}`;
  for (const headers of [
    { Host: 'evil.example' },
    { Host: 'evil.example', 'X-Forwarded-Host': 'example.example', 'X-Forwarded-Proto': 'https' }
  ]) {
    const resumed = await client.get(`/api/quiz/${s.uuid}`).set(headers).set('X-Quiz-Token', s.token).expect(200);
    assert.equal(resumed.body.resultUrl, fallbackUrl);
    const html = await client.get(`/pt-br/resultado/${s.uuid}`).set(headers).expect(200);
    assert.ok(html.text.includes(`<link rel="canonical" href="${fallbackUrl.replace('/resultado/', '/pt-br/resultado/')}">`));
    assert.ok(html.text.includes(`<meta property="og:image" content="${fallbackUrl.replace('/resultado/', '/pt-br/resultado/')}/card.svg">`));
    assert.doesNotMatch(html.text, /evil\.example/);
  }
});
test('proxy confiável mantém HTTPS e domínio público nos links e metadados', async () => {
  app.set('trust proxy', 1);
  try {
    const s = sessions[1];
    const headers = { Host: 'internal-app:3000', 'X-Forwarded-Host': 'example.example', 'X-Forwarded-Proto': 'https', Origin: 'https://example.example' };
    const url = `https://example.example/resultado/${s.uuid}`;
    const completed = await client.post(`/api/quiz/${s.uuid}/complete`).set(headers).set('X-Quiz-Token', s.token).send({ answers }).expect(200);
    assert.equal(completed.body.resultUrl, url);
    const html = await client.get(`/pt-br/resultado/${s.uuid}`).set(headers).expect(200);
    assert.ok(html.text.includes(`<link rel="canonical" href="${url.replace('/resultado/', '/pt-br/resultado/')}">`));
    assert.ok(html.text.includes(`<meta property="og:image" content="${url.replace('/resultado/', '/pt-br/resultado/')}/card.svg">`));
    const unknown = await client.get(`/api/quiz/${s.uuid}`).set({ ...headers, 'X-Forwarded-Host': 'evil.example' }).set('X-Quiz-Token', s.token).expect(200);
    assert.equal(unknown.body.resultUrl, `http://localhost:3000/resultado/${s.uuid}`);
  } finally {
    app.set('trust proxy', false);
  }
});

test('i18n: acesso direto, compatibilidade, queries e API nos quatro idiomas', async () => {
  const versions = [['pt-BR','pt-br'],['en','en'],['es','es'],['zh-CN','zh-cn']];
  for (const [locale,prefix] of versions) {
    for (const path of ['/', '/metodologia','/sobre','/privacidade','/perguntas-frequentes','/quiz','/admin/login']) {
      const response = await client.get(`/${prefix}${path}`).set('Accept-Language','fr').expect(200);
      assert.equal(response.headers['content-language'],locale);
      assert.ok(response.text.includes(`lang="${locale}"`));
      assert.doesNotMatch(response.text, /<!--(?:PAGE_|HOME_FAQ|RESULT_|I18N_DATA)/);
    }
    const catalogue = await client.get('/api/quiz/questions').set('X-Language',locale).expect(200);
    assert.equal(catalogue.body.questions.length,40);
    assert.equal(catalogue.body.questions[0].id,1);
    const invalid = await client.get('/api/results/1').set('X-Language',locale).expect(400);
    assert.equal(invalid.body.code,'uuid');
    const html = await client.get(`/${prefix}/resultado/${sessions[1].uuid}`).expect(200);
    assert.match(html.headers['x-robots-tag'],/noindex/);
    const translated = await client.get(`/api/results/${sessions[1].uuid}`).set('X-Language',locale).expect(200);
    assert.equal(translated.body.economicScore,100);
    assert.equal(translated.body.authorityScore,-100);
    assert.equal(translated.body.labelKeys.political,'rightLibertarian');
    assert.equal(translated.body.answers,undefined);
  }
  await client.get('/sobre?from=old').set('Accept-Language','en-US').expect(302).expect('Location','/en/sobre?from=old');
  await client.get('/sobre?from=old').set('Accept-Language','en-US').set('Cookie','prisma_language=es').expect(302).expect('Location','/es/sobre?from=old');
  await client.get('/en?from=old').expect(308).expect('Location','/en/?from=old');
  await client.get('/en/').set('Accept-Language','pt-BR').expect(200);
  const root = await client.get('/').expect(200);
  assert.match(root.text,/href="\/en\/"/);
  assert.equal((await prisma.quizSession.findUnique({where:{uuid:sessions[1].uuid}})).politicalLabel,'Direita Libertária');
});
