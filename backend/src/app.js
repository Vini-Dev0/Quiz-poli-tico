import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { api } from './routes/api.js';
import { sameOrigin, requireAdmin } from './middlewares/security.js';
import { prisma } from './services/database.js';
import { getResult } from './services/quiz.js';
import { validateUuid } from './utils/validation.js';
import { escapeHtml } from './utils/html.js';
import { getAppUrl } from './utils/app-url.js';
import { pageMetadata, robotsTxt, sitemapXml } from './utils/seo.js';
import { sitePages, renderFaq } from './data/site-pages.js';

const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));
// Templates e conteúdo editorial não dependem de banco e não precisam ser
// relidos do disco a cada visita. O resultado pessoal continua vindo do banco.
const [homeTemplate, infoTemplate, resultTemplate] = await Promise.all(['index.html', 'info.html', 'resultado.html'].map(file => readFile(`${frontend}/${file}`, 'utf8')));
const templates = { 'index.html': homeTemplate, 'info.html': infoTemplate, 'resultado.html': resultTemplate };
const getTemplate = file => config.production ? Promise.resolve(templates[file]) : readFile(`${frontend}/${file}`, 'utf8');
export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
app.use((req, res, next) => {
  res.locals.cspNonce = randomBytes(18).toString('base64');
  if (!config.seoIndexingEnabled || /^\/(?:api|admin|health|resultado)(?:\/|$)/.test(req.path)) res.set('X-Robots-Tag', 'noindex, follow');
  next();
});
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], fontSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'none'"], upgradeInsecureRequests: config.production ? [] : null } }, strictTransportSecurity: config.production ? undefined : false }));
// Compressão só de conteúdo público; respostas com cookies administrativos
// ou tokens de edição não participam da compressão.
app.use(compression({ filter: (req, res) => !/^\/(?:api|admin)(?:\/|$)/.test(req.originalUrl.split('?')[0]) && compression.filter(req, res) }));
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());
app.use(sameOrigin);
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, api);
app.get('/health', async (req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: 'ok' });
});
for (const asset of ['css', 'js', 'assets']) app.use(`/${asset}`, express.static(`${frontend}/${asset}`, { maxAge: config.production ? '1h' : 0, index: false }));
app.get('/robots.txt', (req, res) => res.type('text/plain').set('Cache-Control', 'public, max-age=300').send(robotsTxt()));
app.get('/sitemap.xml', (req, res) => {
  if (!config.seoIndexingEnabled) return res.status(404).set('X-Robots-Tag', 'noindex').send('Sitemap desativado neste ambiente.');
  res.type('application/xml').set('Cache-Control', 'public, max-age=300').send(sitemapXml());
});
app.get(['/index.html', '/index.htm'], (req, res) => res.redirect(301, '/'));
app.get('/', async (req, res) => {
  const html = (await getTemplate('index.html')).replace('<!--PAGE_META-->', pageMetadata(sitePages[0], res.locals.cspNonce)).replace('<!--HOME_FAQ-->', renderFaq(4)).replace('<!--ABANDONMENT_MINUTES-->', config.abandonmentMinutes);
  res.set('Content-Language', 'pt-BR').set('Cache-Control', 'no-cache').type('html').send(html);
});
for (const page of sitePages.slice(1)) {
  app.get(`${page.path}/`, (req, res, next) => req.path.endsWith('/') ? res.redirect(301, page.path) : next());
  app.get(page.path, async (req, res) => {
    const html = (await getTemplate('info.html')).replace('<!--PAGE_META-->', pageMetadata(page, res.locals.cspNonce)).replace('<!--PAGE_BREADCRUMB-->', escapeHtml(page.heading)).replace('<!--PAGE_EYEBROW-->', escapeHtml(page.eyebrow)).replace('<!--PAGE_HEADING-->', escapeHtml(page.heading)).replace('<!--PAGE_INTRODUCTION-->', escapeHtml(page.introduction)).replace('<!--PAGE_CONTENT-->', page.content);
    res.set('Content-Language', 'pt-BR').set('Cache-Control', 'no-cache').type('html').send(html);
  });
}
app.get('/admin/login', (req, res) => { res.set('Cache-Control', 'no-store').sendFile(`${frontend}/admin-login.html`); });
app.get('/admin', (req, res, next) => requireAdmin(req, res, error => {
  if (error?.status === 401) return res.redirect('/admin/login');
  if (error) return next(error);
  res.set('Cache-Control', 'no-store').sendFile(`${frontend}/admin.html`);
}));
app.get('/resultado/:uuid', async (req, res) => {
  const result = await getResult(validateUuid(req.params.uuid));
  const appUrl = getAppUrl(req);
  const url = `${appUrl}/resultado/${result.uuid}`;
  const title = `Meu resultado: ${result.politicalLabel} | Prisma`;
  const description = `Visão econômica: ${result.economicView.label} (${result.economicScore > 0 ? '+' : ''}${result.economicScore}). Visão de autoridade: ${result.authorityView.label} (${result.authorityScore > 0 ? '+' : ''}${result.authorityScore}). Duas dimensões do mesmo resultado.`;
  const metadata = `<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="noindex, follow"><meta property="og:site_name" content="Prisma"><meta property="og:locale" content="pt_BR"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${escapeHtml(url)}"><meta property="og:image" content="${escapeHtml(appUrl)}/resultado/${result.uuid}/card.svg"><meta name="twitter:card" content="summary"><link rel="canonical" href="${escapeHtml(url)}">`;
  res.set('Content-Language', 'pt-BR').set('Cache-Control', 'no-store').send((await getTemplate('resultado.html')).replace('<!--RESULT_META-->', metadata).replace('<!--RESULT_FALLBACK-->', `<noscript><h1>${escapeHtml(result.politicalLabel)}</h1><h2>Visão econômica</h2><dl><dt>Pontuação econômica</dt><dd>${result.economicScore}</dd><dt>Classificação econômica</dt><dd>${escapeHtml(result.economicLabel)}</dd></dl><h2>Visão de autoridade</h2><dl><dt>Pontuação de autoridade</dt><dd>${result.authorityScore}</dd><dt>Classificação de autoridade</dt><dd>${escapeHtml(result.authorityLabel)}</dd></dl><p>Ative JavaScript para ver o gráfico e compartilhar.</p></noscript>`));
});
app.get('/resultado/:uuid/card.svg', async (req, res) => {
  const result = await getResult(validateUuid(req.params.uuid));
  const label = escapeHtml(result.politicalLabel);
  const economicScore = `${result.economicScore > 0 ? '+' : ''}${result.economicScore}`;
  const authorityScore = `${result.authorityScore > 0 ? '+' : ''}${result.authorityScore}`;
  res.type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><radialGradient id="g"><stop stop-color="#423375"/><stop offset="1" stop-color="#101018"/></radialGradient></defs><rect width="1200" height="630" fill="url(#g)"/><rect x="65" y="65" width="1070" height="500" rx="28" fill="#15151f" stroke="#55506b"/><rect x="105" y="285" width="480" height="190" rx="16" fill="#211c2c" stroke="#40364f"/><rect x="615" y="285" width="480" height="190" rx="16" fill="#211c2c" stroke="#40364f"/><g font-family="system-ui,sans-serif" fill="#f5f2ff"><text x="110" y="145" font-size="27" fill="#b8a5f2">PRISMA / SEU RESULTADO</text><text x="110" y="235" font-size="60" font-weight="700">${label}</text><text x="130" y="325" font-size="19" fill="#b8a5f2">VISÃO ECONÔMICA</text><text x="130" y="378" font-size="30">${escapeHtml(result.economicLabel)}</text><text x="130" y="441" font-size="44" fill="#d5bcfb">${economicScore}</text><text x="640" y="325" font-size="19" fill="#b8a5f2">VISÃO DE AUTORIDADE</text><text x="640" y="378" font-size="30">${escapeHtml(result.authorityLabel)}</text><text x="640" y="441" font-size="44" fill="#d5bcfb">${authorityScore}</text><text x="110" y="530" font-size="23" fill="#b8b6c6">40 perguntas. Dois eixos. Uma nova perspectiva.</text></g></svg>`);
});
app.use((req, res) => res.set('X-Robots-Tag', 'noindex').status(404).format({ json: () => res.json({ error: 'Página não encontrada.' }), html: () => res.type('html').send('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Página não encontrada</title><body><h1>Página não encontrada</h1><a href="/">Voltar ao Prisma</a></body></html>'), default: () => res.send('Não encontrado.') }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || (error.type === 'entity.parse.failed' ? 400 : 500);
  res.set('X-Robots-Tag', 'noindex');
  if (status >= 500) console.error('Erro da aplicação:', error.code || error.name);
  const message = status >= 500 ? 'Não foi possível processar sua solicitação. Tente novamente.' : error.message;
  if (req.path.startsWith('/api/') || req.path === '/health') return res.status(status).json({ error: message });
  res.status(status).type('html').send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prisma — aviso</title><body><h1>${escapeHtml(message)}</h1><a href="/">Voltar ao início</a></body></html>`);
});
