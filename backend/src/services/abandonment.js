import { prisma } from './database.js';
import { config } from '../config.js';
export async function sweepAbandoned(now = new Date()) {
  const cutoff = new Date(now.getTime() - config.abandonmentMinutes * 60_000);
  const result = await prisma.quizSession.updateMany({ where: { status: 'STARTED', lastActivityAt: { lt: cutoff } }, data: { status: 'ABANDONED' } });
  await prisma.adminSession.deleteMany({ where: { expiresAt: { lt: now } } });
  return result.count;
}
export function startAbandonmentJob() {
  let running = false;
  const interval = setInterval(async () => {
    if (running) return;
    running = true;
    try { await sweepAbandoned(); } catch (error) { console.error('Falha na rotina de abandono:', error.code || error.name); } finally { running = false; }
  }, 60_000);
  interval.unref();
  return interval;
}
