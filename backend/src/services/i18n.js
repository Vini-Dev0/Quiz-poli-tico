import { readFileSync } from 'node:fs';
import { locales, namespaces, fallback, localeInfo, localizedPath, pathLocale, chooseLocale, lookup } from '../../../frontend/js/i18n-config.js';
import { escapeHtml } from '../utils/html.js';
export { locales, fallback, localeInfo, localizedPath, pathLocale, chooseLocale };
export const resources = Object.fromEntries(locales.map(({ code }) => [code, Object.fromEntries(namespaces.map(namespace => [namespace, JSON.parse(readFileSync(new URL(`../../../frontend/locales/${code}/${namespace}.json`, import.meta.url), 'utf8'))]))]));
export const t = (locale, key, params = {}) => lookup(resources[locale] || resources[fallback], key, params, resources[fallback]);
export function requestLocale(req) {
  return chooseLocale({ pathname: req.path, saved: req.get('X-Language'), languages: [] });
}
export function languageLinks(path, locale) {
  return `<details class="language-selector"><summary>${escapeHtml(localeInfo(locale).name)} <span aria-hidden="true">⌄</span></summary><nav aria-label="${escapeHtml(t(locale, 'messages.language'))}">${locales.map(item => `<a href="${escapeHtml(localizedPath(path, item.code))}" data-language="${item.code}" lang="${item.code}" hreflang="${item.hreflang}"${locale === item.code ? ' aria-current="true"' : ''}>${item.name}</a>`).join('')}</nav></details><span id="language-status" class="sr-only" role="status" aria-live="polite"></span>`;
}
export function renderTemplate(source, locale, path, nonce, params = {}) {
  let html = source.replace(/lang="pt-BR"/, `lang="${locale}"`);
  html = html.replace(/(<([\w-]+)[^>]*\bdata-i18n="([^"]+)"[^>]*>)([^<]*)(<\/\2>)/g, (_, open, tag, key, body, close) => `${open}${/^\s/.test(body) ? ' ' : ''}${escapeHtml(t(locale, key, params))}${/\s$/.test(body) ? ' ' : ''}${close}`);
  html = html.replace(/<[^>]+\bdata-i18n-[^>]+>/g, tag => tag.replace(/\b(aria-label|title|placeholder|alt)="[^"]*"/g, (full, attr) => {
    const key = tag.match(new RegExp(`data-i18n-${attr}="([^"]+)"`))?.[1];
    return key ? `${attr}="${escapeHtml(t(locale, key, params))}"` : full;
  }));
  html = html.replace(/href="(\/[^"\s]*)"/g, (full, link) => /^\/(?:assets|css|js|api|locales|sitemap.xml|robots.txt)(?:\/|$|\?)/.test(link) ? full : `href="${escapeHtml(localizedPath(link, locale))}"`);
  // Os recursos são JSON escapado, nunca HTML executável ou código traduzido.
  const pick = code => Object.fromEntries(namespaces.filter(name => name !== 'pages').map(name => [name, resources[code][name]]));
  const payload = JSON.stringify({ locale, resources: pick(locale), fallbackResources: locale === fallback ? {} : pick(fallback), params }).replace(/[<>&\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  html = html.replace('<!--I18N_DATA-->', `<script id="i18n-data" type="application/json" nonce="${nonce}">${payload}</script>`);
  const selector = languageLinks(path, locale);
  return html.includes('class="site-header') ? html.replace(/(<header class="site-header[^>]*>)/, `$1${selector}`) : html.replace(/<body([^>]*)>/, `<body$1><div class="admin-language">${selector}</div>`);
}
const errorKeys = new Map(Object.entries(resources[fallback].messages).map(([key, value]) => [value, key]));
export function translateError(message, locale) {
  const key = errorKeys.get(message);
  if (key) return { code: key, message: t(locale, `messages.${key}`) };
  if (/^Filtro \w+ inválido\.$/.test(message)) {
    const params = { name: message.split(' ')[1] };
    return { code: 'filterInvalid', message: t(locale, 'messages.filterInvalid', params), params };
  }
  return { code: 'request', message: t(locale, 'messages.request') };
}
// Classificações salvas em português continuam intactas no banco. As chaves
// descrevem os rótulos EXISTENTES; nenhum score ou categoria é recalculado.
export function resultKeys(result) {
  const base = resources[fallback].results;
  return {
    economic: base.economic.indexOf(result.economicLabel),
    authority: base.authority.indexOf(result.authorityLabel),
    political: Object.keys(base.political).find(key => base.political[key] === result.politicalLabel)
  };
}
export function localizeResult(result, locale) {
  const keys = resultKeys(result);
  const economicLabel = keys.economic >= 0 ? t(locale, `results.economic.${keys.economic}`) : result.economicLabel;
  const authorityLabel = keys.authority >= 0 ? t(locale, `results.authority.${keys.authority}`) : result.authorityLabel;
  const politicalLabel = keys.political ? t(locale, `results.political.${keys.political}`) : result.politicalLabel;
  return { ...result, economicLabel, authorityLabel, politicalLabel, labelKeys: keys,
    ...(result.economicView ? { economicView: { ...result.economicView, label: economicLabel }, authorityView: { ...result.authorityView, label: authorityLabel } } : {}) };
}
