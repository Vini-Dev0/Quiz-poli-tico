import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, {
  DOTENV_CONFIG_PATH: '/nonexistent/prisma-quiz-test.env', NODE_ENV: 'production',
  APP_URL: 'https://quiz.example.com,https://ladopolitico.online', SEO_URL: 'https://ladopolitico.online', SEO_INDEXING_ENABLED: 'true',
  GOOGLE_SITE_VERIFICATION: 'unit-verification-token', DATABASE_URL: 'postgresql://quiz:test@database:5432/quiz',
  ADMIN_PASSWORD: 'seo-unit-test-password', JWT_SECRET: 'seo-unit-test-secret-at-least-32-characters'
});
const { serializeJsonLd, pageMetadata, robotsTxt, sitemapXml } = await import('../src/utils/seo.js');
const { sitePages, renderFaq } = await import('../src/data/site-pages.js');

test('JSON-LD escapa HTML e mantém os valores sem permitir fechamento do script', () => {
  const data = { value: '</script><script>alert(1)</script>&\u2028\u2029' };
  const serialized = serializeJsonLd(data);
  assert.doesNotMatch(serialized, /[<>&\u2028\u2029]/);
  assert.deepEqual(JSON.parse(serialized), data);
});
test('nome do site e metadados usam o domínio escolhido com conteúdo real', () => {
  const metadata = pageMetadata(sitePages[0], 'safe-nonce');
  assert.match(metadata, /canonical" href="https:\/\/ladopolitico\.online\/"/);
  assert.match(metadata, /summary_large_image/);
  assert.match(metadata, /social-card\.png/);
  assert.match(metadata, /google-site-verification" content="unit-verification-token/);
  const structured = JSON.parse(metadata.match(/nonce="safe-nonce">([^]*?)<\/script>/)[1]);
  assert.deepEqual(structured['@graph'].map(item => item['@type']), ['WebSite', 'WebPage']);
  assert.equal(structured['@graph'][0].name, 'Prisma');
  assert.doesNotMatch(metadata, /aggregateRating|reviewCount|SearchAction|FAQPage/);
});
test('sitemap contém somente URLs canônicas públicas, sem datas inventadas ou UUIDs', () => {
  const xml = sitemapXml();
  assert.equal((xml.match(/<loc>/g) || []).length, sitePages.length);
  assert.equal(new Set(sitePages.map(page => page.path)).size, sitePages.length);
  assert.doesNotMatch(xml, /resultado|admin|api|example\.com|localhost|lastmod|changefreq|priority/);
  assert.match(xml, /https:\/\/ladopolitico\.online\/metodologia/);
});
test('robots permite recursos públicos e resultados para que noindex seja lido', () => {
  const robots = robotsTxt();
  assert.match(robots, /Sitemap: https:\/\/ladopolitico\.online\/sitemap\.xml/);
  assert.doesNotMatch(robots, /Disallow: \/(?:resultado|css|js|assets|$)/m);
});
test('conteúdo público explica limitações, cálculo e dados usados, sem promessas científicas', () => {
  assert.match(renderFaq(), /sem validação psicométrica/);
  assert.match(renderFaq(), /Como descobrir meu lado político/);
  assert.match(sitePages.find(page => page.path === '/metodologia').content, /20 contribuem para o eixo econômico e 20/);
  assert.match(sitePages.find(page => page.path === '/privacidade').content, /não apaga o registro salvo/);
});
