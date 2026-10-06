// Verificação pública após o deploy. Não exige .env, banco ou autenticação.
import assert from 'node:assert/strict';
const base = new URL(process.argv[2] || 'https://ladopolitico.online').origin;
const canonicalOrigin = new URL(process.argv[3] || base).origin;
const paths = ['/', '/metodologia', '/sobre', '/privacidade', '/perguntas-frequentes'];
const titles = new Set();
try {
  for (const path of paths) {
    const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 200, `${path}: resposta HTTP inesperada`);
    assert.doesNotMatch(response.headers.get('x-robots-tag') || '', /noindex/i, `${path}: indexação desativada`);
    const html = await response.text();
    assert.ok(html.includes(`<link rel="canonical" href="${canonicalOrigin}${path}">`), `${path}: canonical incorreto`);
    assert.match(html, /<meta name="robots" content="index, follow/, `${path}: meta robots não permite indexação`);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${path}: deve ter um H1`);
    const [, nonce, json] = html.match(/<script type="application\/ld\+json" nonce="([^"]+)">([^]*?)<\/script>/) || [];
    assert.ok(nonce && response.headers.get('content-security-policy')?.includes(`'nonce-${nonce}'`), `${path}: JSON-LD e CSP incompatíveis`);
    assert.equal(JSON.parse(json)['@context'], 'https://schema.org');
    const title = html.match(/<title>(.*?)<\/title>/)?.[1];
    assert.ok(title, `${path}: título ausente`);
    titles.add(title);
  }
  assert.equal(titles.size, paths.length, 'Títulos duplicados entre páginas');
  const robots = await fetch(`${base}/robots.txt`, { signal: AbortSignal.timeout(15_000) });
  assert.equal(robots.status, 200);
  assert.ok((await robots.text()).includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`), 'Sitemap ausente em robots.txt');
  const sitemap = await fetch(`${base}/sitemap.xml`, { signal: AbortSignal.timeout(15_000) });
  assert.equal(sitemap.status, 200);
  const xml = await sitemap.text();
  assert.equal((xml.match(/<loc>/g) || []).length, paths.length);
  assert.doesNotMatch(xml, /resultado|admin|localhost/);
  const image = await fetch(`${base}/assets/social-card.png`, { signal: AbortSignal.timeout(15_000) });
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type') || '', /image\/png/);
  const login = await fetch(`${base}/admin/login`, { signal: AbortSignal.timeout(15_000) });
  assert.match(login.headers.get('x-robots-tag') || '', /noindex/);
  console.log('SEO técnico validado: 5 páginas, canonicals, JSON-LD/CSP, sitemap, robots, preview PNG e administração fora da indexação.');
  console.log('Essa verificação não mede posição no Google nem substitui Search Console e métricas de usuários reais.');
} catch (error) {
  console.error(`Falha na verificação SEO: ${error.message}`);
  process.exitCode = 1;
}
