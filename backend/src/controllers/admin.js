import { promisify } from 'node:util';
import { scrypt, scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../services/database.js';
import { cookieOptions } from '../middlewares/security.js';
import { HttpError } from '../utils/errors.js';
import * as admin from '../services/admin.js';
const derive = promisify(scrypt);
const salt = randomBytes(16);
const expected = scryptSync(config.adminPassword, salt, 64);
export async function login(req, res) {
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length > 1024) throw new HttpError(400, 'Informe uma senha válida.');
  const actual = await derive(password, salt, 64);
  if (!timingSafeEqual(actual, expected)) throw new HttpError(401, 'Senha incorreta.');
  const session = await prisma.adminSession.create({ data: { expiresAt: new Date(Date.now() + config.adminTtlMs) } });
  const token = jwt.sign({}, config.jwtSecret, { algorithm: 'HS256', subject: session.id, issuer: 'prisma-politica', audience: 'admin', expiresIn: '8h' });
  res.cookie(config.adminCookie, token, { ...cookieOptions, maxAge: config.adminTtlMs }).json({ authenticated: true });
}
export async function logout(req, res) {
  await prisma.adminSession.deleteMany({ where: { id: req.adminSessionId } });
  res.clearCookie(config.adminCookie, cookieOptions).json({ authenticated: false });
}
export const stats = async (req, res) => res.json(await admin.getStats(req.query));
export const results = async (req, res) => res.json(await admin.getAdminResults(req.query));
export const distribution = async (req, res) => res.json(await admin.getDistribution(req.query));
export const scatter = async (req, res) => res.json(await admin.getScatter(req.query));
