import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../services/database.js';
import { HttpError } from '../utils/errors.js';

export function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if ((origin && origin !== config.appUrl) || req.get('sec-fetch-site') === 'cross-site') return next(new HttpError(403, 'Origem não autorizada.'));
  next();
}
export async function requireAdmin(req, res, next) {
  try {
    const payload = jwt.verify(req.cookies[config.adminCookie] || '', config.jwtSecret, { algorithms: ['HS256'], issuer: 'prisma-politica', audience: 'admin' });
    const session = await prisma.adminSession.findUnique({ where: { id: payload.sub } });
    if (!session || session.expiresAt <= new Date()) throw new Error('expired');
    req.adminSessionId = session.id;
    next();
  } catch (error) {
    if (error.code?.startsWith('P')) return next(error);
    next(new HttpError(401, 'Faça login para acessar a administração.'));
  }
}
export const cookieOptions = { httpOnly: true, secure: config.production, sameSite: 'strict', path: '/' };
