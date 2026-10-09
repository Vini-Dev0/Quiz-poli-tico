// Auditoria pública após o deploy: sem .env, banco ou autenticação.
import assert from 'node:assert/strict';
import { locales, localizedPath } from '../../frontend/js/i18n-config.js';
const base = new URL(process.argv[2] || 'https://ladopolitico.online').origin;
const canonicalOrigin = new URL(process.argv[3] || base).origin;
const paths = ['/', '/metodologia', '/sobre', '/privacidade', '/perguntas-frequentes'];
const titles = new Set();
try {
  for (const locale of locales) for (const path of paths) {
    const localized = localizedPath(path,locale.code);
    const response = await fetch(`${base}${localized}`, { signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status,200,localized);
    assert.doesNotMatch(response.headers.get('x-robots-tag') || '',/noindex/i,localized);
    assert.equal(response.headers.get('content-language'),locale.code);
    const html = await response.text();
    assert.ok(html.includes(`<link rel="canonical" href="${canonicalOrigin}${localized}">`),localized);
    assert.match(html,/<meta name="robots" content="index, follow/);
    assert.equal((html.match(/<h1\b/g)||[]).length,1,localized);
    assert.ok(html.includes(`lang="${locale.code}"`));
    for (const other of locales) assert.ok(html.includes(`hreflang="${other.hreflang}" href="${canonicalOrigin}${localizedPath(path,other.code)}"`));
    assert.ok(html.includes('hreflang="x-default"'));
    const [,nonce,json] = html.match(/<script type="application\/ld\+json" nonce="([^"]+)">([^]*?)<\/script>/) || [];
    assert.ok(nonce && response.headers.get('content-security-policy')?.includes(`'nonce-${nonce}'`));
    assert.equal(JSON.parse(json)['@context'],'https://schema.org');
    const title = html.match(/<title>(.*?)<\/title>/)?.[1];
    assert.ok(title); titles.add(title);
  }
  assert.equal(titles.size,20);
  const robots = await fetch(`${base}/robots.txt`);
  assert.equal(robots.status,200);
  assert.ok((await robots.text()).includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`));
  const sitemap = await fetch(`${base}/sitemap.xml`);
  assert.equal(sitemap.status,200);
  const xml = await sitemap.text();
  assert.equal((xml.match(/<loc>/g)||[]).length,20);
  assert.equal((xml.match(/<xhtml:link/g)||[]).length,100);
  assert.doesNotMatch(xml,/resultado|admin|localhost/);
  for (const locale of locales) {
    const image = await fetch(`${base}/assets/social-card-${locale.prefix}.png`);
    assert.equal(image.status,200);
    assert.match(image.headers.get('content-type')||'',/image\/png/);
    const bytes = new DataView(await image.arrayBuffer());
    assert.equal(bytes.getUint32(16),1200); assert.equal(bytes.getUint32(20),630);
  }
  const login = await fetch(`${base}/pt-br/admin/login`);
  assert.match(login.headers.get('x-robots-tag')||'',/noindex/);
  console.log('SEO internacional validado: 20 páginas, quatro idiomas, canonical, hreflang/zh-Hans, JSON-LD/CSP, sitemap, robots e previews PNG.');
  console.log('Esta auditoria não mede ranking nem confirma que o Google conseguiu rastrear o servidor. Consulte o Search Console e logs do proxy.');
} catch (error) {
  console.error(`Falha na verificação SEO: ${error.message}`);
  process.exitCode = 1;
}
