import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { api } from './routes/api.js';
import { sameOrigin, requireAdmin } from './middlewares/security.js';
import { prisma } from './services/database.js';
import { getResult } from './services/quiz.js';
import { validateUuid } from './utils/validation.js';
import { escapeHtml } from './utils/html.js';

const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));
export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], fontSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'none'"], upgradeInsecureRequests: config.production ? [] : null } }, strictTransportSecurity: config.production ? undefined : false }));
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());
app.use(sameOrigin);
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, api);
app.get('/health', async (req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: 'ok' });
});
for (const asset of ['css', 'js', 'assets']) app.use(`/${asset}`, express.static(`${frontend}/${asset}`, { maxAge: config.production ? '1h' : 0, index: false }));
app.get('/', (req, res) => res.sendFile(`${frontend}/index.html`));
app.get('/admin/login', (req, res) => { res.set('Cache-Control', 'no-store').sendFile(`${frontend}/admin-login.html`); });
app.get('/admin', (req, res, next) => requireAdmin(req, res, error => {
  if (error?.status === 401) return res.redirect('/admin/login');
  if (error) return next(error);
  res.set('Cache-Control', 'no-store').sendFile(`${frontend}/admin.html`);
}));
app.get('/resultado/:uuid', async (req, res) => {
  const result = await getResult(validateUuid(req.params.uuid));
  const url = `${config.appUrl}/resultado/${result.uuid}`;
  const title = `Meu resultado: ${result.politicalLabel} | Prisma`;
  const description = `Economia: ${result.economicScore > 0 ? '+' : ''}${result.economicScore}. Autoridade: ${result.authorityScore > 0 ? '+' : ''}${result.authorityScore}. Descubra seu posicionamento em dois eixos independentes.`;
  const metadata = `<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${escapeHtml(url)}"><meta property="og:image" content="${escapeHtml(config.appUrl)}/resultado/${result.uuid}/card.svg"><meta name="twitter:card" content="summary"><link rel="canonical" href="${escapeHtml(url)}">`;
  const html = await readFile(`${frontend}/resultado.html`, 'utf8');
  res.send(html.replace('<!--RESULT_META-->', metadata).replace('<!--RESULT_FALLBACK-->', `<noscript><h1>${escapeHtml(result.politicalLabel)}</h1><p>${escapeHtml(description)}</p><p>Ative JavaScript para ver o gráfico e compartilhar.</p></noscript>`));
});
app.get('/resultado/:uuid/card.svg', async (req, res) => {
  const result = await getResult(validateUuid(req.params.uuid));
  const label = escapeHtml(result.politicalLabel);
  res.type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><radialGradient id="g"><stop stop-color="#423375"/><stop offset="1" stop-color="#101018"/></radialGradient></defs><rect width="1200" height="630" fill="url(#g)"/><rect x="65" y="65" width="1070" height="500" rx="28" fill="#15151f" stroke="#55506b"/><g font-family="system-ui,sans-serif" fill="#f5f2ff"><text x="110" y="155" font-size="30" fill="#b8a5f2">PRISMA / SEU RESULTADO</text><text x="110" y="295" font-size="64" font-weight="700">${label}</text><text x="110" y="380" font-size="30">Economia: ${result.economicScore} · Autoridade: ${result.authorityScore}</text><text x="110" y="490" font-size="26" fill="#b8b6c6">40 perguntas. Dois eixos. Uma nova perspectiva.</text></g></svg>`);
});
app.use((req, res) => res.status(404).format({ json: () => res.json({ error: 'Página não encontrada.' }), html: () => res.type('html').send('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página não encontrada</title><body><h1>Página não encontrada</h1><a href="/">Voltar ao Prisma</a></body></html>'), default: () => res.send('Não encontrado.') }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || (error.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error('Erro da aplicação:', error.code || error.name);
  const message = status >= 500 ? 'Não foi possível processar sua solicitação. Tente novamente.' : error.message;
  if (req.path.startsWith('/api/') || req.path === '/health') return res.status(status).json({ error: message });
  res.status(status).type('html').send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prisma — aviso</title><body><h1>${escapeHtml(message)}</h1><a href="/">Voltar ao início</a></body></html>`);
});
