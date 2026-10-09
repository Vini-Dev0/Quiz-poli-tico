import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { getSitePages, renderFaq } from '../data/site-pages.js';
import { pageMetadata, alternateLinks } from '../utils/seo.js';
import { requireAdmin } from '../middlewares/security.js';
import { getResult } from '../services/quiz.js';
import { validateUuid } from '../utils/validation.js';
import { escapeHtml } from '../utils/html.js';
import { getAppUrl } from '../utils/app-url.js';
import { renderTemplate, t, localizeResult, localeInfo, localizedPath } from '../services/i18n.js';
const frontend = fileURLToPath(new URL('../../../frontend/', import.meta.url));
const files = ['index.html', 'info.html', 'resultado.html', 'admin.html', 'admin-login.html'];
const cached = Object.fromEntries(await Promise.all(files.map(async file => [file, await readFile(`${frontend}/${file}`, 'utf8')])));
const template = async file => config.production ? cached[file] : readFile(`${frontend}/${file}`, 'utf8');
export const pages = Router();
async function sendPage(req, res, file, replacements = {}, cache = 'no-cache') {
  let html = await template(file);
  for (const [key, value] of Object.entries(replacements)) html = html.replace(`<!--${key}-->`, value);
  html = html.replace('<!--ABANDONMENT_MINUTES-->', config.abandonmentMinutes);
  html = renderTemplate(html, req.locale, req.originalUrl, res.locals.cspNonce, { minutes: config.abandonmentMinutes });
  res.set('Content-Language', req.locale).set('Cache-Control', cache).type('html').send(html);
}
pages.get(['/', '/quiz'], async (req, res) => {
  const page = getSitePages(req.locale)[0];
  if (req.path === '/quiz') res.set('X-Robots-Tag', 'noindex, follow');
  await sendPage(req, res, 'index.html', { PAGE_META: pageMetadata(page, res.locals.cspNonce, req.locale), HOME_FAQ: renderFaq(4, req.locale) });
});
for (const definition of getSitePages().slice(1)) {
  pages.get(definition.path, async (req, res) => {
    const page = getSitePages(req.locale).find(item => item.path === definition.path);
    await sendPage(req, res, 'info.html', { PAGE_META: pageMetadata(page, res.locals.cspNonce, req.locale), PAGE_BREADCRUMB: escapeHtml(page.heading), PAGE_EYEBROW: escapeHtml(page.eyebrow), PAGE_HEADING: escapeHtml(page.heading), PAGE_INTRODUCTION: escapeHtml(page.introduction), PAGE_CONTENT: page.content });
  });
}
pages.get('/admin/login', (req, res) => sendPage(req, res, 'admin-login.html', {}, 'no-store'));
pages.get('/admin', (req, res, next) => requireAdmin(req, res, error => {
  if (error?.status === 401) return res.redirect(302, localizedPath('/admin/login', req.locale));
  if (error) return next(error);
  sendPage(req, res, 'admin.html', {}, 'no-store').catch(next);
}));
pages.get('/resultado/:uuid', async (req, res) => {
  const result = localizeResult(await getResult(validateUuid(req.params.uuid)), req.locale);
  const origin = getAppUrl(req);
  const path = `/resultado/${result.uuid}`;
  const url = `${origin}${localizedPath(path, req.locale)}`;
  const number = value => `${value > 0 ? '+' : ''}${Number(value).toLocaleString(req.locale, { maximumFractionDigits: 2 })}`;
  const params = { label: result.politicalLabel, economicLabel: result.economicLabel, authorityLabel: result.authorityLabel, economic: number(result.economicScore), authority: number(result.authorityScore) };
  const title = `${t(req.locale, 'results.shareTitle', params)} | Prisma`;
  const description = t(req.locale, 'results.description', params);
  const metadata = `<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="noindex, follow"><meta property="og:site_name" content="Prisma"><meta property="og:locale" content="${localeInfo(req.locale).og}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${escapeHtml(url)}"><meta property="og:image" content="${escapeHtml(`${url}/card.svg`)}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(url)}">${alternateLinks(path)}`;
  const fallback = `<noscript><h1>${escapeHtml(result.politicalLabel)}</h1>${['economic', 'authority'].map((axis, i) => `<h2>${escapeHtml(t(req.locale, `ui.text${i ? '115' : '104'}`))}</h2><dl><dt>${escapeHtml(t(req.locale, `ui.text${i ? '116' : '105'}`))}</dt><dd>${number(result[`${axis}Score`])}</dd><dt>${escapeHtml(t(req.locale, `ui.text${i ? '117' : '106'}`))}</dt><dd>${escapeHtml(result[`${axis}Label`])}</dd></dl>`).join('')}<p>${escapeHtml(t(req.locale, 'results.javascript'))}</p></noscript>`;
  await sendPage(req, res, 'resultado.html', { RESULT_META: metadata, RESULT_FALLBACK: fallback }, 'no-store');
});
pages.get('/resultado/:uuid/card.svg', async (req, res) => {
  const result = localizeResult(await getResult(validateUuid(req.params.uuid)), req.locale);
  const signed = value => `${value > 0 ? '+' : ''}${Number(value).toLocaleString(req.locale)}`;
  const text = (x, y, size, value, color = '#f5f2ff') => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${escapeHtml(value)}</text>`;
  res.set('Content-Language', req.locale).type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#101018"/><rect x="65" y="65" width="1070" height="500" rx="28" fill="#15151f" stroke="#55506b"/><g font-family="system-ui, sans-serif">${text(110,145,27,`PRISMA / ${t(req.locale,'ui.text128')}`,'#b8a5f2')}${text(110,235,46,result.politicalLabel)}${text(130,325,19,t(req.locale,'ui.text104'),'#b8a5f2')}${text(130,378,25,result.economicLabel)}${text(130,441,44,signed(result.economicScore))}${text(640,325,19,t(req.locale,'ui.text115'),'#b8a5f2')}${text(640,378,25,result.authorityLabel)}${text(640,441,44,signed(result.authorityScore))}${text(110,530,23,t(req.locale,'results.cardFooter'),'#b8b6c6')}</g></svg>`);
});
