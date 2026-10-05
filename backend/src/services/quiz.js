import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { prisma } from './database.js';
import { config } from '../config.js';
import { QUIZ_VERSION } from '../data/questions.js';
import { calculateResult } from '../utils/scoring.js';
import { HttpError } from '../utils/errors.js';

export const publicSelect = { uuid: true, economicScore: true, authorityScore: true, economicLabel: true, authorityLabel: true, politicalLabel: true, completedAt: true };
const hashToken = token => createHash('sha256').update(token).digest('hex');
export async function startQuiz() {
  const token = randomBytes(32).toString('base64url');
  const session = await prisma.quizSession.create({ data: { uuid: randomUUID(), editTokenHash: hashToken(token), quizVersion: QUIZ_VERSION }, select: { uuid: true, currentQuestion: true } });
  return { ...session, token, quizVersion: QUIZ_VERSION };
}
export function authorizeSession(session, token) {
  if (!session) throw new HttpError(404, 'Sessão não encontrada.');
  const provided = hashToken(typeof token === 'string' ? token : '');
  if (!timingSafeEqual(Buffer.from(session.editTokenHash), Buffer.from(provided))) throw new HttpError(403, 'Esta sessão não pertence a este navegador.');
  if (session.quizVersion !== QUIZ_VERSION) throw new HttpError(409, 'O questionário foi atualizado. Inicie um novo quiz.');
}
export async function resumeQuiz(uuid, token) {
  const session = await prisma.quizSession.findUnique({ where: { uuid } });
  authorizeSession(session, token);
  if (session.status === 'COMPLETED') return { uuid, status: session.status, resultUrl: `${config.appUrl}/resultado/${uuid}` };
  return { uuid, status: session.status, currentQuestion: session.currentQuestion, answers: session.answers, quizVersion: session.quizVersion };
}
// Lock de linha: evita que progressos simultâneos sobrescrevam a conclusão
// ou que a rotina de abandono rebaixe uma sessão recém-finalizada.
async function lockedMutation(uuid, token, mutate) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "QuizSession" WHERE "uuid" = ${uuid}::uuid FOR UPDATE`;
    const session = await tx.quizSession.findUnique({ where: { uuid } });
    authorizeSession(session, token);
    return mutate(tx, session);
  });
}
export function updateProgress(uuid, token, progress) {
  return lockedMutation(uuid, token, async (tx, session) => {
    if (session.status === 'COMPLETED') throw new HttpError(409, 'Este quiz já foi concluído.');
    if (Object.keys(progress.answers).length < Object.keys(session.answers).length) throw new HttpError(409, 'Progresso antigo: recarregue a sessão antes de continuar.');
    return tx.quizSession.update({ where: { uuid }, data: { ...progress, status: 'STARTED', lastActivityAt: new Date() }, select: { uuid: true, status: true, currentQuestion: true, lastActivityAt: true } });
  });
}
export function completeQuiz(uuid, token, answers) {
  return lockedMutation(uuid, token, async (tx, session) => {
    if (session.status === 'COMPLETED') return tx.quizSession.findUnique({ where: { uuid }, select: publicSelect });
    const now = new Date();
    return tx.quizSession.update({ where: { uuid }, data: { ...calculateResult(answers), answers, currentQuestion: 40, status: 'COMPLETED', completedAt: now, lastActivityAt: now }, select: publicSelect });
  });
}
export async function getResult(uuid) {
  const result = await prisma.quizSession.findFirst({ where: { uuid, status: 'COMPLETED' }, select: publicSelect });
  if (!result) throw new HttpError(404, 'Resultado não encontrado ou quiz ainda não concluído.');
  return result;
}
export async function shareResult(uuid) {
  const result = await prisma.quizSession.updateMany({ where: { uuid, status: 'COMPLETED', shared: false }, data: { shared: true, sharedAt: new Date() } });
  if (!result.count) await getResult(uuid);
  return { shared: true };
}
