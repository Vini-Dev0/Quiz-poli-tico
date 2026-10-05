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
  databaseUrl,
  adminPassword: required('ADMIN_PASSWORD', 12),
  jwtSecret: required('JWT_SECRET', 32),
  abandonmentMinutes,
  trustProxy: process.env.TRUST_PROXY === '1' ? 1 : false,
  adminCookie: production ? '__Host-prisma_admin' : 'prisma_admin',
  adminTtlMs: 8 * 60 * 60 * 1000
};
