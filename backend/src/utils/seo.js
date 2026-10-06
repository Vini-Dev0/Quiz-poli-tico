import { config } from '../config.js';
import { escapeHtml } from './html.js';
import { sitePages } from '../data/site-pages.js';

export function serializeJsonLd(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function pageMetadata(page, nonce) {
  const canonical = `${config.seoUrl}${page.path}`;
  const image = `${config.seoUrl}/assets/social-card.png`;
  const webpage = { '@type': page.type || 'WebPage', '@id': `${canonical}#webpage`, url: canonical, name: page.title, description: page.description, inLanguage: 'pt-BR', isPartOf: { '@id': `${config.seoUrl}/#website` } };
  const graph = [webpage];
  if (page.path === '/') graph.unshift({ '@type': 'WebSite', '@id': `${config.seoUrl}/#website`, url: `${config.seoUrl}/`, name: 'Prisma', alternateName: 'Prisma Quiz Político', description: page.description, inLanguage: 'pt-BR' });
  else {
    webpage.breadcrumb = { '@id': `${canonical}#breadcrumb` };
    graph.push({ '@type': 'BreadcrumbList', '@id': `${canonical}#breadcrumb`, itemListElement: [ { '@type': 'ListItem', position: 1, name: 'Início', item: `${config.seoUrl}/` }, { '@type': 'ListItem', position: 2, name: page.heading, item: canonical } ] });
  }
  const robots = config.seoIndexingEnabled ? 'index, follow, max-image-preview:large' : 'noindex, follow';
  return `<title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}">
    <meta name="robots" content="${robots}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <meta property="og:site_name" content="Prisma">
    <meta property="og:locale" content="pt_BR">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(page.title)}">
    <meta property="og:description" content="${escapeHtml(page.description)}">
    <meta property="og:url" content="${escapeHtml(canonical)}">
    <meta property="og:image" content="${escapeHtml(image)}">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Prisma: quiz de posicionamento político com 40 perguntas e dois eixos independentes">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(page.title)}">
    <meta name="twitter:description" content="${escapeHtml(page.description)}">
    <meta name="twitter:image" content="${escapeHtml(image)}">
    ${page.path === '/' && config.googleSiteVerification ? `<meta name="google-site-verification" content="${escapeHtml(config.googleSiteVerification)}">` : ''}
    <script type="application/ld+json" nonce="${escapeHtml(nonce)}">${serializeJsonLd({ '@context': 'https://schema.org', '@graph': graph })}</script>`;
}

export function sitemapXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitePages.map(page => `<url><loc>${escapeHtml(`${config.seoUrl}${page.path}`)}</loc></url>`).join('')}</urlset>`;
}

export function robotsTxt() {
  // Resultados não são bloqueados aqui: o crawler precisa ler seu noindex.
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /health\n${config.seoIndexingEnabled ? `Sitemap: ${config.seoUrl}/sitemap.xml\n` : ''}`;
}
