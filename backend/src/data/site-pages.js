import { config } from '../config.js';
import { escapeHtml } from '../utils/html.js';
import { resources, t, localizedPath } from '../services/i18n.js';
export const pageDefinitions = [
  { key: 'home', path: '/' },
  { key: 'methodology', path: '/metodologia' },
  { key: 'about', path: '/sobre', type: 'AboutPage' },
  { key: 'privacy', path: '/privacidade' },
  { key: 'faq', path: '/perguntas-frequentes' }
];
// Apenas links internos conhecidos são aceitos. Todo texto é escapado.
function paragraph(value, locale) {
  return escapeHtml(value).replace(/\[\[(\/[^|]+)\|([^\]]+)\]\]/g, (match, path, label) => pageDefinitions.some(page => page.path === path) ? `<a href="${localizedPath(path, locale)}">${label}</a>` : match);
}
export function renderFaq(limit = 9, locale = 'pt-BR') {
  return resources[locale].pages.items.slice(0, limit).map(({ question, answer }) => `<details class="faq-item"><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer.replace('{minutes}', config.abandonmentMinutes))}</p></details>`).join('');
}
export const faq = resources['pt-BR'].pages.items;
export function getSitePages(locale = 'pt-BR') {
  return pageDefinitions.map(definition => {
    const page = resources[locale].pages[definition.key];
    let content = (page.sections || []).map((section, index) => {
      let extra = '';
      if (definition.key === 'methodology') {
        if (index === 0) extra = `<ol>${page.scale.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`;
        if (index === 2) extra = `<pre class="formula"><code>${escapeHtml(page.formula)}</code></pre>`;
        if (index === 3) {
          const limits = ['−100 ≤ {value} < −70', '−70 ≤ {value} < −40', '−40 ≤ {value} < −10', '−10 ≤ {value} ≤ +10', '+10 < {value} ≤ +40', '+40 < {value} ≤ +70', '+70 < {value} ≤ +100'];
          extra = `<div class="table-scroll" tabindex="0" aria-label="${escapeHtml(page.table.aria)}"><table class="method-table"><caption>${escapeHtml(page.table.caption)}</caption><thead><tr>${['score', 'economic', 'authority'].map(key => `<th scope="col">${escapeHtml(page.table[key])}</th>`).join('')}</tr></thead><tbody>${limits.map((range, i) => `<tr><td>${escapeHtml(range.replace('{value}', page.table.value))}</td><td>${escapeHtml(t(locale, `results.economic.${i}`))}</td><td>${escapeHtml(t(locale, `results.authority.${i}`))}</td></tr>`).join('')}</tbody></table></div>`;
        }
      }
      return `<section${definition.key === 'methodology' && index === 4 ? ' class="editorial-note"' : ''}><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map((value, i) => `<p>${paragraph(value, locale)}</p>${i === 0 ? extra : ''}`).join('')}</section>`;
    }).join('');
    if (definition.key === 'faq') content = `<section class="editorial-faq" aria-label="${escapeHtml(page.aria)}">${renderFaq(9, locale)}</section>${content}`;
    return { ...definition, ...page, content };
  });
}
export const sitePages = getSitePages();
