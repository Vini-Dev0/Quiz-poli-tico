// Única definição de idiomas, rotas e negociação; compartilhada com Node.
export const locales = Object.freeze([
  { code: 'pt-BR', prefix: 'pt-br', hreflang: 'pt-BR', og: 'pt_BR', name: 'Português (Brasil)' },
  { code: 'en', prefix: 'en', hreflang: 'en', og: 'en_US', name: 'English' },
  { code: 'es', prefix: 'es', hreflang: 'es', og: 'es_ES', name: 'Español' },
  { code: 'zh-CN', prefix: 'zh-cn', hreflang: 'zh-Hans', og: 'zh_CN', name: '简体中文' }
]);
export const fallback = 'pt-BR';
export const namespaces = ['ui', 'quiz', 'results', 'messages', 'pages'];
export const preferenceKey = 'prisma.language';
/** @param {string} code */
export const localeInfo = code => locales.find(locale => locale.code === code) || locales[0];
/** @param {string | null | undefined} value */
export function matchLocale(value = '') {
  const tag = String(value).toLowerCase().replaceAll('_', '-');
  if (/^pt(?:-|$)/.test(tag)) return 'pt-BR';
  if (/^en(?:-|$)/.test(tag)) return 'en';
  if (/^es(?:-|$)/.test(tag)) return 'es';
  // Não equiparar escrita tradicional à simplificada. Tentar a próxima
  // preferência do navegador; sem alternativa, usar português e seleção manual.
  if (tag === 'zh' || /^zh-(?:cn|sg|hans)(?:-|$)/.test(tag)) return 'zh-CN';
  return null;
}
/** @param {string} pathname */
export function pathLocale(pathname) {
  return locales.find(locale => pathname.split('/')[1] === locale.prefix)?.code || null;
}
/** @param {{ pathname?: string, saved?: string | null, languages?: readonly string[] }} options */
export function chooseLocale({ pathname = '/', saved, languages = [] } = {}) {
  return pathLocale(pathname) || matchLocale(saved) || languages.map(matchLocale).find(Boolean) || fallback;
}
/** @param {string} pathname */
export function basePath(pathname) {
  return pathLocale(pathname) ? pathname.replace(/^\/[^/]+/, '') || '/' : pathname;
}
/** @param {string} path @param {string} code */
export function localizedPath(path, code) {
  const url = new URL(path, 'https://i18n.invalid');
  const base = basePath(url.pathname);
  return `/${localeInfo(code).prefix}${base === '/' ? '/' : base}${url.search}${url.hash}`;
}
/** @param {unknown} value @param {Record<string, string | number>} params */
export function interpolate(value, params = {}) {
  return String(value).replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(params, key) ? String(params[key]) : match);
}
/** @param {Record<string, unknown>} resources @param {string} key @param {Record<string, string | number>} params @param {Record<string, unknown>} fallbackResources */
export function lookup(resources, key, params = {}, fallbackResources = {}) {
  const [namespace, ...parts] = key.split('.');
  /** @param {Record<string, unknown>} source */
  const find = source => {
    /** @type {unknown} */
    let value = source[namespace];
    for (const part of parts) {
      if (Array.isArray(value)) value = value[Number(part)];
      else if (value && typeof value === 'object') value = /** @type {Record<string, unknown>} */ (value)[part];
      else return undefined;
    }
    return value;
  };
  return interpolate(find(resources) ?? find(fallbackResources) ?? key, params);
}
