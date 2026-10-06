import 'dotenv/config';
function required(name, min = 1) {
  const value = process.env[name];
  if (!value || value.length < min || value.startsWith('replace-with')) throw new Error(`Configure a variável de ambiente ${name} (mínimo ${min} caracteres).`);
  return value;
}
const production = process.env.NODE_ENV === 'production';
const appUrls = [...new Set(required('APP_URL').split(',').map(value => {
  let url;
  try {
    if (!value.trim()) throw new Error('empty');
    url = new URL(value.trim());
  } catch {
    throw new Error('APP_URL deve conter URLs válidas separadas por vírgula, sem entradas vazias.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Cada URL em APP_URL deve usar HTTP ou HTTPS.');
  if (production && url.protocol !== 'https:') throw new Error('Todas as URLs em APP_URL devem usar HTTPS em produção.');
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Cada URL em APP_URL deve conter apenas a origem pública, sem caminho, parâmetros ou credenciais.');
  return url.origin;
}))];
const isLocalOrigin = origin => {
  const hostname = new URL(origin).hostname;
  return hostname === 'localhost' || hostname.endsWith('.localhost') || /^127\./.test(hostname) || ['0.0.0.0', '[::1]'].includes(hostname);
};
let seoUrl = appUrls.find(origin => !isLocalOrigin(origin)) || appUrls[0];
if (process.env.SEO_URL?.trim()) {
  try {
    const url = new URL(process.env.SEO_URL.trim());
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || !appUrls.includes(url.origin)) throw new Error('invalid');
    seoUrl = url.origin;
  } catch {
    throw new Error('SEO_URL deve ser uma das origens de APP_URL, sem caminho, parâmetros ou credenciais.');
  }
}
const indexing = process.env.SEO_INDEXING_ENABLED?.trim();
if (indexing && !['true', 'false'].includes(indexing)) throw new Error('SEO_INDEXING_ENABLED deve ser true ou false.');
const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim() || '';
if (googleSiteVerification && !/^[A-Za-z0-9_-]{1,256}$/.test(googleSiteVerification)) throw new Error('GOOGLE_SITE_VERIFICATION deve conter somente o token fornecido pelo Search Console.');
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT deve ser uma porta válida entre 1 e 65535.');
const databaseUrl = required('DATABASE_URL');
try {
  const database = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname || !database.pathname || database.pathname === '/') throw new Error('invalid');
} catch {
  throw new Error('DATABASE_URL deve ser uma URL de conexão PostgreSQL válida.');
}
const abandonmentMinutes = Number(process.env.ABANDONMENT_MINUTES || 30);
if (!Number.isFinite(abandonmentMinutes) || abandonmentMinutes <= 0) throw new Error('ABANDONMENT_MINUTES deve ser positivo.');
export const config = {
  port,
  production,
  appUrl: appUrls[0],
  appUrls: Object.freeze(appUrls),
  seoUrl,
  seoIndexingEnabled: (indexing ? indexing === 'true' : production) && !isLocalOrigin(seoUrl),
  googleSiteVerification,
  databaseUrl,
  adminPassword: required('ADMIN_PASSWORD', 12),
  jwtSecret: required('JWT_SECRET', 32),
  abandonmentMinutes,
  trustProxy: process.env.TRUST_PROXY === '1' ? 1 : false,
  adminCookie: production ? '__Host-prisma_admin' : 'prisma_admin',
  adminTtlMs: 8 * 60 * 60 * 1000
};
