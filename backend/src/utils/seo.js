import { config } from '../config.js';
import { escapeHtml } from './html.js';
import { sitePages } from '../data/site-pages.js';
import { locales, localeInfo, localizedPath } from '../services/i18n.js';

export function serializeJsonLd(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function pageMetadata(page, nonce, locale = 'pt-BR') {
  const canonical = `${config.seoUrl}${localizedPath(page.path, locale)}`;
  const image = `${config.seoUrl}/assets/social-card-${localeInfo(locale).prefix}.png`;
  const webpage = { '@type': page.type || 'WebPage', '@id': `${canonical}#webpage`, url: canonical, name: page.title, description: page.description, inLanguage: locale, isPartOf: { '@id': `${config.seoUrl}/#website` } };
  const graph = [webpage];
  if (page.path === '/') graph.unshift({ '@type': 'WebSite', '@id': `${config.seoUrl}/#website`, url: `${config.seoUrl}/`, name: 'Prisma', alternateName: 'Prisma', description: page.description, inLanguage: locales.map(item => item.code) });
  else {
    webpage.breadcrumb = { '@id': `${canonical}#breadcrumb` };
    graph.push({ '@type': 'BreadcrumbList', '@id': `${canonical}#breadcrumb`, itemListElement: [ { '@type': 'ListItem', position: 1, name: localeInfo(locale).name, item: `${config.seoUrl}${localizedPath('/', locale)}` }, { '@type': 'ListItem', position: 2, name: page.heading, item: canonical } ] });
  }
  const robots = config.seoIndexingEnabled ? 'index, follow, max-image-preview:large' : 'noindex, follow';
  return `<title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}">
    <meta name="robots" content="${robots}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    ${alternateLinks(page.path)}
    <meta property="og:site_name" content="Prisma">
    <meta property="og:locale" content="${localeInfo(locale).og}">
    ${locales.filter(item => item.code !== locale).map(item => `<meta property="og:locale:alternate" content="${item.og}">`).join('')}
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(page.title)}">
    <meta property="og:description" content="${escapeHtml(page.description)}">
    <meta property="og:url" content="${escapeHtml(canonical)}">
    <meta property="og:image" content="${escapeHtml(image)}">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${escapeHtml(page.title)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(page.title)}">
    <meta name="twitter:description" content="${escapeHtml(page.description)}">
    <meta name="twitter:image" content="${escapeHtml(image)}">
    ${page.path === '/' && config.googleSiteVerification ? `<meta name="google-site-verification" content="${escapeHtml(config.googleSiteVerification)}">` : ''}
    <script type="application/ld+json" nonce="${escapeHtml(nonce)}">${serializeJsonLd({ '@context': 'https://schema.org', '@graph': graph })}</script>`;
}

export function sitemapXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitePages.flatMap(page => locales.map(locale => `<url><loc>${escapeHtml(`${config.seoUrl}${localizedPath(page.path, locale.code)}`)}</loc>${alternateLinks(page.path, 'xhtml:link')}</url>`)).join('\n')}\n</urlset>`;
}
export function alternateLinks(path, tag = 'link') {
  return [...locales.map(locale => ({ hreflang: locale.hreflang, path: localizedPath(path, locale.code) })), { hreflang: 'x-default', path: path === '/' ? '/' : localizedPath(path, 'pt-BR') }].map(item => `<${tag} rel="alternate" hreflang="${item.hreflang}" href="${escapeHtml(`${config.seoUrl}${item.path}`)}"${tag === 'link' ? '' : ' /'}>`).join('\n');
}

export function robotsTxt() {
  // Resultados não são bloqueados aqui: o crawler precisa ler seu noindex.
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /health\n${config.seoIndexingEnabled ? `Sitemap: ${config.seoUrl}/sitemap.xml\n` : ''}`;
}
