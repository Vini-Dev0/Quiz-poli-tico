import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
if (existsSync('.env')) {
  console.log('.env já existe; nenhum valor foi alterado.');
} else {
  const password = randomBytes(24).toString('base64url');
  writeFileSync('.env', `NODE_ENV=development\nPORT=3000\nAPP_URL=http://localhost:3000\nDATABASE_URL=postgresql://quiz:quiz_local_only@localhost:5432/quiz?schema=public\nADMIN_PASSWORD=${password}\nJWT_SECRET=${randomBytes(48).toString('base64url')}\nABANDONMENT_MINUTES=30\nTRUST_PROXY=0\n`, { mode: 0o600, flag: 'wx' });
  console.log('.env criado com segredos aleatórios. Consulte ADMIN_PASSWORD no arquivo para entrar na dashboard. Configure DATABASE_URL antes de iniciar.');
}
