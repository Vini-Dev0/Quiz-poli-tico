import 'dotenv/config';
function required(name, min = 1) {
  const value = process.env[name];
  if (!value || value.length < min || value.startsWith('replace-with')) throw new Error(`Configure a variável de ambiente ${name} (mínimo ${min} caracteres).`);
  return value;
}
const url = new URL(required('APP_URL'));
const production = process.env.NODE_ENV === 'production';
if (!['http:', 'https:'].includes(url.protocol) || (production && url.protocol !== 'https:')) throw new Error('APP_URL deve usar HTTPS em produção.');
if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('APP_URL deve conter apenas a origem pública, sem caminho, parâmetros ou credenciais.');
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
  appUrl: url.origin,
  databaseUrl,
  adminPassword: required('ADMIN_PASSWORD', 12),
  jwtSecret: required('JWT_SECRET', 32),
  abandonmentMinutes,
  trustProxy: process.env.TRUST_PROXY === '1' ? 1 : false,
  adminCookie: production ? '__Host-prisma_admin' : 'prisma_admin',
  adminTtlMs: 8 * 60 * 60 * 1000
};
