import { prisma } from './database.js';
import { sweepAbandoned } from './abandonment.js';
import { HttpError } from '../utils/errors.js';
import { integerQuery } from '../utils/validation.js';
import { ECONOMIC_LABELS, AUTHORITY_LABELS } from '../utils/scoring.js';

function choice(value, map, name) {
  if (value === undefined || value === '' || value === 'all') return undefined;
  if (typeof value !== 'string' || !Object.hasOwn(map, value)) throw new HttpError(400, `Filtro ${name} inválido.`);
  return map[value];
}
export function buildFilters(query) {
  const filters = [];
  const status = choice(query.status, { STARTED: 'STARTED', COMPLETED: 'COMPLETED', ABANDONED: 'ABANDONED' }, 'status');
  if (status) filters.push({ status });
  const shared = choice(query.shared, { yes: true, no: false }, 'compartilhamento');
  if (shared !== undefined) filters.push({ status: 'COMPLETED', shared });
  const economic = choice(query.economic, {
    left: { lt: -40 }, centerLeft: { gte: -40, lt: -10 }, center: { gte: -10, lte: 10 }, centerRight: { gt: 10, lte: 40 }, right: { gt: 40 }
  }, 'econômico');
  if (economic) filters.push({ economicScore: economic, status: 'COMPLETED' });
  const authority = choice(query.authority, {
    libertarian: { lt: -40 }, liberal: { gte: -40, lt: -10 }, center: { gte: -10, lte: 10 }, authoritarian: { gt: 10 }
  }, 'autoridade');
  if (authority) filters.push({ authorityScore: authority, status: 'COMPLETED' });
  return { AND: filters };
}
const rate = (part, total) => total ? Number((part / total * 100).toFixed(2)) : 0;
export async function getStats(query) {
  await sweepAbandoned();
  const where = buildFilters(query);
  const [started, completed, abandoned, shared, active] = await prisma.$transaction([
    prisma.quizSession.count({ where }),
    prisma.quizSession.count({ where: { AND: [where, { status: 'COMPLETED' }] } }),
    prisma.quizSession.count({ where: { AND: [where, { status: 'ABANDONED' }] } }),
    prisma.quizSession.count({ where: { AND: [where, { status: 'COMPLETED', shared: true }] } }),
    prisma.quizSession.count({ where: { AND: [where, { status: 'STARTED' }] } })
  ], { isolationLevel: 'RepeatableRead' });
  return { started, total: started, completed, abandoned, shared, notShared: completed - shared, active, completionRate: rate(completed, started), abandonmentRate: rate(abandoned, started), shareRate: rate(shared, completed) };
}
export async function getAdminResults(query) {
  await sweepAbandoned();
  const where = buildFilters(query);
  const page = integerQuery(query.page, 1, 1_000_000);
  const limit = integerQuery(query.limit, 25, 100);
  const order = choice(query.sort, { newest: { startedAt: 'desc' }, oldest: { startedAt: 'asc' }, economic: { economicScore: { sort: 'desc', nulls: 'last' } }, authority: { authorityScore: { sort: 'desc', nulls: 'last' } } }, 'ordenação') || { startedAt: 'desc' };
  const [data, total] = await prisma.$transaction([
    prisma.quizSession.findMany({ where, orderBy: [order, { id: 'desc' }], skip: (page - 1) * limit, take: limit, select: { uuid: true, status: true, currentQuestion: true, economicScore: true, authorityScore: true, economicLabel: true, authorityLabel: true, politicalLabel: true, shared: true, startedAt: true, completedAt: true } }),
    prisma.quizSession.count({ where })
  ], { isolationLevel: 'RepeatableRead' });
  return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
}
export async function getDistribution(query) {
  await sweepAbandoned();
  const where = { AND: [buildFilters(query), { status: 'COMPLETED' }] };
  const [economic, authority, political] = await prisma.$transaction([
    prisma.quizSession.groupBy({ by: ['economicLabel'], where, _count: { _all: true } }),
    prisma.quizSession.groupBy({ by: ['authorityLabel'], where, _count: { _all: true } }),
    prisma.quizSession.groupBy({ by: ['politicalLabel'], where, _count: { _all: true }, orderBy: { _count: { politicalLabel: 'desc' } } })
  ], { isolationLevel: 'RepeatableRead' });
  const mapLabels = (labels, rows, field) => labels.map(label => ({ label, count: rows.find(row => row[field] === label)?._count._all || 0 }));
  return { economic: mapLabels(ECONOMIC_LABELS, economic, 'economicLabel'), authority: mapLabels(AUTHORITY_LABELS, authority, 'authorityLabel'), political: political.map(row => ({ label: row.politicalLabel, count: row._count._all })) };
}
// Pontos paginados: o gráfico nunca recebe UUID, respostas ou identificadores.
export async function getScatter(query) {
  const page = integerQuery(query.page, 1, 1_000_000);
  const limit = integerQuery(query.limit, 1000, 1000);
  const where = { AND: [buildFilters(query), { status: 'COMPLETED' }] };
  const [data, total] = await prisma.$transaction([
    prisma.quizSession.findMany({ where, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit, select: { economicScore: true, authorityScore: true } }),
    prisma.quizSession.count({ where })
  ], { isolationLevel: 'RepeatableRead' });
  return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
}
