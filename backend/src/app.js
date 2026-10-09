import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { api } from './routes/api.js';
import { prisma } from './services/database.js';
import { escapeHtml } from './utils/html.js';

import { robotsTxt, sitemapXml, alternateLinks } from './utils/seo.js';
import { sameOrigin } from './middlewares/security.js';
import { pages } from './routes/pages.js';
import { locales, chooseLocale, requestLocale, localizedPath, t, translateError, localizeResult, resources, renderTemplate } from './services/i18n.js';

const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));
export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
app.use((req, res, next) => {
  res.locals.cspNonce = randomBytes(18).toString('base64');
  req.locale = requestLocale(req);
  if (!config.seoIndexingEnabled || /^\/(?:api|health)(?:\/|$)/.test(req.path) || /\/(?:admin|resultado|quiz)(?:\/|$)/.test(req.path)) res.set('X-Robots-Tag', 'noindex, follow');
  next();
});
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], fontSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], frameAncestors: ["'none'"], upgradeInsecureRequests: config.production ? [] : null } }, strictTransportSecurity: config.production ? undefined : false }));
// Compressão só de conteúdo público; respostas com cookies administrativos
// ou tokens de edição não participam da compressão.
app.use(compression({ filter: (req, res) => !/\/(?:api|admin)(?:\/|$)/.test(req.originalUrl.split('?')[0]) && compression.filter(req, res) }));
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());
// Localização na borda da API: contratos, IDs, filtros e persistência intactos.
app.use('/api', (req, res, next) => {
  const json = res.json.bind(res);
  res.json = body => {
    let value = body;
    if (body?.error && !body.code) {
      const error = translateError(body.error, req.locale);
      value = { ...body, error: error.message, code: error.code, ...(error.params ? { params: error.params } : {}) };
    } else if (body?.questions) {
      value = { ...body, questions: body.questions.map(question => ({ ...question, text: t(req.locale,`quiz.questions.${question.id}`), topic: t(req.locale, question.id <= 20 ? 'quiz.topicEconomic' : 'quiz.topicAuthority') })) };
    } else if (body?.economicLabel) value = localizeResult(body, req.locale);
    else if (Array.isArray(body?.data)) value = { ...body, data: body.data.map(item => item.economicLabel ? localizeResult(item, req.locale) : item) };
    else if (body?.economic && body?.authority && body?.political) {
      const localLabel = (label, axis) => {
        const source = resources['pt-BR'].results[axis];
        const key = Array.isArray(source) ? source.indexOf(label) : Object.keys(source).find(key => source[key] === label);
        return key !== undefined && key !== -1 ? t(req.locale,`results.${axis}.${key}`) : label;
      };
      value = Object.fromEntries(['economic','authority','political'].map(axis => [axis,body[axis].map(item => {
        const source = resources['pt-BR'].results[axis];
        const labelKey = Array.isArray(source) ? source.indexOf(item.label) : Object.keys(source).find(key => source[key] === item.label);
        return { ...item, labelKey, label: localLabel(item.label,axis) };
      })]));
    }
    if (value?.resultUrl && req.get('X-Language')) value = { ...value, resultUrl: value.resultUrl.replace(/(https?:\/\/[^/]+)(\/resultado\/[^]*)/, (match,origin,path) => origin + localizedPath(path,req.locale)) };
    res.set('Content-Language',req.locale);
    return json(value);
  };
  next();
});
app.use(sameOrigin);
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, api);
app.get('/health', async (req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: 'ok' });
});
for (const asset of ['css', 'js', 'assets', 'locales']) app.use(`/${asset}`, express.static(`${frontend}/${asset}`, { maxAge: config.production ? '1h' : 0, index: false }));
app.get('/robots.txt', (req, res) => res.type('text/plain').set('Cache-Control', 'public, max-age=300').send(robotsTxt()));
app.get('/sitemap.xml', (req, res) => {
  if (!config.seoIndexingEnabled) return res.status(404).set('X-Robots-Tag', 'noindex').send('Sitemap desativado neste ambiente.');
  res.type('application/xml').set('Cache-Control', 'public, max-age=300').send(sitemapXml());
});
// A raiz é estável para crawlers e oferece links de seleção sem JavaScript.
// No navegador, i18n.js encaminha pela preferência manual ou navigator.languages.
app.get('/', (req, res) => {
  const nonce = res.locals.cspNonce;
  const title = t('pt-BR', 'messages.selectorTitle');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Prisma</title><meta name="description" content="${t('pt-BR','messages.selectorDescription')}"><meta name="robots" content="${config.seoIndexingEnabled ? 'index, follow' : 'noindex, follow'}"><link rel="canonical" href="${config.seoUrl}/">${alternateLinks('/')}<link rel="stylesheet" href="/css/style.css?v=4"><script type="module" src="/js/i18n.js?v=4"></script><!--I18N_DATA--></head><body><main class="language-welcome wrap"><a class="brand" href="/pt-br/">prisma</a><h1>${title}</h1><p>${t('pt-BR','messages.selectorDescription')}</p>${locales.map(locale => `<a class="button button-outline" data-language="${locale.code}" lang="${locale.code}" href="${localizedPath('/',locale.code)}">${locale.name}</a>`).join('')}</main></body></html>`;
  res.set('Cache-Control','no-cache').type('html').send(renderTemplate(html,'pt-BR','/',nonce));
});
for (const locale of locales) {
  app.get(`/${locale.prefix}`, (req, res, next) => {
    if (req.path.endsWith('/')) return next();
    res.redirect(308, `/${locale.prefix}/${req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : ''}`);
  });
  app.use(`/${locale.prefix}`, (req, res, next) => {
    req.locale = locale.code;
    if (req.path.length > 1 && req.path.endsWith('/')) return res.redirect(308, req.originalUrl.replace(/\/(?=\?|$)/, ''));
    next();
  }, pages);
}
// Compatibilidade: negociação somente nas URLs antigas sem prefixo.
app.get(['/index.html','/index.htm','/quiz','/metodologia','/sobre','/privacidade','/perguntas-frequentes','/admin','/admin/login','/resultado/:uuid','/resultado/:uuid/card.svg'], (req, res) => {
  const languages = (req.get('Accept-Language') || '').split(',').map(value => value.split(';')[0]);
  const locale = chooseLocale({ saved: req.cookies.prisma_language, languages });
  const path = /^\/index\./.test(req.path) ? `/${req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : ''}` : req.originalUrl;
  res.set('Vary','Accept-Language, Cookie').set('Cache-Control','no-store').redirect(302, localizedPath(path,locale));
});
function errorPage(req, res, status, message) {
  const locale = req.locale || 'pt-BR';
  res.status(status).set('X-Robots-Tag','noindex').set('Content-Language',locale).type('html').send(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Prisma — ${escapeHtml(message)}</title></head><body><h1>${escapeHtml(message)}</h1><a href="${localizedPath('/',locale)}">${escapeHtml(t(locale,'messages.back'))}</a></body></html>`);
}
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: t('pt-BR','messages.notFound') });
  errorPage(req,res,404,t(req.locale,'messages.notFound'));
});
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || (error.type === 'entity.parse.failed' ? 400 : 500);
  res.set('X-Robots-Tag', 'noindex');
  if (status >= 500) console.error('Erro da aplicação:', error.code || error.name);
  const message = status >= 500 ? t('pt-BR','messages.server') : error.message;
  if (req.path.startsWith('/api/') || req.path === '/health') {
    const translated = translateError(message, req.locale);
    return res.status(status).json({ error: translated.message, code: translated.code, ...(translated.params ? { params: translated.params } : {}) });
  }
  errorPage(req,res,status,translateError(message,req.locale).message);
});
