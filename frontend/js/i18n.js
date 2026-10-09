import { locales, namespaces, fallback, preferenceKey, chooseLocale, pathLocale, localizedPath, lookup } from './i18n-config.js?v=4';
const bootstrap = document.getElementById('i18n-data');
let data = bootstrap ? JSON.parse(bootstrap.textContent) : { locale: fallback, resources: {}, fallbackResources: {}, params: {} };
export const language = () => data.locale;
export const t = (key, params = {}) => lookup(data.resources, key, { ...data.params, ...params }, data.fallbackResources);
export const localPath = path => localizedPath(path, language());
export function safeRead(storage, key) { try { return window[storage].getItem(key); } catch { return null; } }
export function safeWrite(storage, key, value) { try { window[storage].setItem(key, value); } catch { /* URL e memória permanecem funcionais. */ } }
export function safeRemove(storage, key) { try { window[storage].removeItem(key); } catch { /* Quiz em memória. */ } }
function savePreference(code) {
  safeWrite('localStorage', preferenceKey, code);
  // Cookie funcional sem dados pessoais, usado apenas na compatibilidade
  // de URLs antigas. localStorage segue como preferência principal da raiz.
  try { document.cookie = `prisma_language=${code}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`; } catch { /* URL é fonte de verdade. */ }
}
export function translatedResult(result) {
  const keys = result.labelKeys;
  if (!keys) return result;
  return { ...result, economicLabel: keys.economic >= 0 ? t(`results.economic.${keys.economic}`) : result.economicLabel, authorityLabel: keys.authority >= 0 ? t(`results.authority.${keys.authority}`) : result.authorityLabel, politicalLabel: keys.political ? t(`results.political.${keys.political}`) : result.politicalLabel };
}
function applyTranslations() {
  document.documentElement.lang = language();
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const previous = element.textContent;
    // Preserve os espaços entre fragmentos de texto, links e números inline.
    const params = element.dataset.i18nParams ? JSON.parse(element.dataset.i18nParams) : {};
    element.textContent = `${/^\s/.test(previous) ? ' ' : ''}${t(element.dataset.i18n, params)}${/\s$/.test(previous) ? ' ' : ''}`;
  });
  for (const attr of ['aria-label', 'title', 'placeholder', 'alt']) {
    document.querySelectorAll(`[data-i18n-${attr}]`).forEach(element => element.setAttribute(attr, t(element.getAttribute(`data-i18n-${attr}`))));
  }
  document.querySelectorAll('a[href^="/"]').forEach(link => {
    const path = new URL(link.href).pathname;
    if (!/^\/(?:api|css|js|assets|locales)(?:\/|$)/.test(path) && !link.dataset.language) link.setAttribute('href', localPath(link.getAttribute('href')));
  });
  document.querySelectorAll('[data-language]').forEach(link => {
    link.href = localizedPath(`${location.pathname}${location.search}${location.hash}`, link.dataset.language);
    if (link.dataset.language === language()) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('.language-selector summary').forEach(summary => { summary.firstChild.textContent = `${locales.find(item => item.code === language()).name} `; });
  document.querySelectorAll('.language-selector nav').forEach(nav => nav.setAttribute('aria-label', t('messages.language')));
}
let switching = false;
export async function changeLanguage(code, { history = true, save = true } = {}) {
  if (!locales.some(locale => locale.code === code) || switching) return;
  const path = localizedPath(`${location.pathname}${location.search}${location.hash}`, code);
  if (code === language() && pathLocale(location.pathname)) { if (save) savePreference(code); return; }
  switching = true;
  try {
    const response = await fetch(path, { credentials: 'same-origin', signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error('language');
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    const next = parsed.getElementById('i18n-data');
    if (!next) throw new Error('language');
    data = JSON.parse(next.textContent);
    if (history) window.history.pushState({}, '', path);
    if (save) savePreference(code);
    const nonce = bootstrap?.nonce;
    document.head.querySelectorAll('title, meta[name="description"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"], link[rel="alternate"], script[type="application/ld+json"]').forEach(node => node.remove());
    parsed.head.querySelectorAll('title, meta[name="description"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"], link[rel="alternate"], script[type="application/ld+json"]').forEach(node => { const clone = node.cloneNode(true); if (nonce && clone.tagName === 'SCRIPT') clone.nonce = nonce; document.head.append(clone); });
    // Somente o conteúdo editorial muda de árvore. Formulários, respostas,
    // listeners, foco e sessão continuam na mesma aplicação em memória.
    for (const selector of ['.editorial-main article', '.breadcrumbs [aria-current]', '.faq-list']) {
      const target = document.querySelector(selector), source = parsed.querySelector(selector);
      if (target && source) target.replaceChildren(...source.childNodes);
    }
    applyTranslations();
    document.dispatchEvent(new CustomEvent('languagechange', { detail: { language: code } }));
    document.querySelectorAll('.language-selector').forEach(menu => { menu.open = false; });
    const status = document.getElementById('language-status');
    if (status) status.textContent = t('messages.languageChanged', { language: locales.find(locale => locale.code === code).name });
    document.querySelector('.language-selector summary')?.focus({ preventScroll: true });
  } catch {
    const status = document.getElementById('language-status');
    if (status) status.textContent = t('messages.languageFailed');
  } finally { switching = false; }
}
document.addEventListener('click', event => {
  const link = event.target.closest?.('[data-language]');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  // A raiz é uma página de seleção com fallback sem JavaScript.
  if (!pathLocale(location.pathname)) { savePreference(link.dataset.language); return; }
  event.preventDefault();
  changeLanguage(link.dataset.language);
});
window.addEventListener('popstate', () => { const code = pathLocale(location.pathname); if (code && code !== language()) changeLanguage(code, { history: false, save: false }); });
export const ready = (async () => {
  if (!bootstrap && pathLocale(location.pathname)) {
    const code = pathLocale(location.pathname);
    const load = async locale => Object.fromEntries(await Promise.all(namespaces.filter(n => n !== 'pages').map(async namespace => [namespace, await (await fetch(`/locales/${locale}/${namespace}.json`)).json()])));
    data = { locale: code, resources: await load(code), fallbackResources: code === fallback ? {} : await load(fallback), params: {} };
    applyTranslations();
  }
  if (location.pathname === '/') {
    let saved;
    try { saved = safeRead('localStorage', preferenceKey); } catch { /* storage indisponível */ }
    const preferred = chooseLocale({ saved, languages: navigator.languages || [navigator.language] });
    location.replace(localizedPath(`/${location.search}${location.hash}`, preferred));
  }
})();
