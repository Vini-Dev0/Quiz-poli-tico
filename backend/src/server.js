import { app } from './app.js';
import { prisma } from './services/database.js';
import { config } from './config.js';
import { startAbandonmentJob, sweepAbandoned } from './services/abandonment.js';
await prisma.$connect();
await sweepAbandoned();
const job = startAbandonmentJob();
const server = app.listen(config.port, '0.0.0.0', () => console.log(`Prisma disponível em ${config.appUrls.join(', ')}`));
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  clearInterval(job);
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
