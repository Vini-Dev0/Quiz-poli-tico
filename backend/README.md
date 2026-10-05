# Backend Prisma

API Express 5 em JavaScript/ESM, Node.js 22 e PostgreSQL via Prisma 6.19.3. O frontend é servido pelo mesmo processo na pasta `../frontend`.

Para uma VPS com EasyPanel, use o [guia de deploy](../deploy/EASYPANEL.md): o Dockerfile recomendado está na raiz e os segredos ficam em App → Environment. O arquivo `.env` é opcional em runtime e não entra na imagem.

## Instalação

```sh
npm install
npm run setup
# Ajuste DATABASE_URL no .env.
npx prisma generate
npx prisma migrate dev
npm run dev
```

O setup cria uma senha administrativa e um segredo JWT aleatórios, sem mostrar segredos no terminal. Para configuração manual, copie `.env.example` para `.env`. Consulte a senha em `.env` e acesse `/admin`. Reinicie o backend após alterar variáveis.

`APP_URL` aceita uma ou mais origens separadas por vírgula, por exemplo `http://localhost:3000,http://example.example` em desenvolvimento. Os links públicos usam o domínio acessado se estiver na lista; o primeiro é a alternativa para acessos internos. Em produção, todas as origens devem usar HTTPS. Frontend e API são servidos juntos em cada domínio.

Em produção: `npm ci --omit=dev`, `npx prisma migrate deploy` e `npm start`. O CLI Prisma é dependência de produção para permitir a migration durante a inicialização do Docker.

## Verificação

```sh
npm test
export TEST_DATABASE_URL='postgresql://quiz:quiz_local_only@localhost:5432/quiz?schema=quiz_test'
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
npm run test:integration
npx playwright install chromium
npm run test:e2e
```

Os testes de integração limpam apenas `quiz_test`. Não execute testes contra produção. A suíte de navegador inicia um servidor separado na porta 3001. Execute as suítes sequencialmente.

O guia completo de PostgreSQL, Compose, segurança, endpoints, cálculo, métricas, perguntas e deploy está no [README da raiz](../README.md).
