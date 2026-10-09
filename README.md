# Prisma — quiz de posicionamento político

Aplicação full stack em **HTML/CSS/JavaScript puro**, **Node.js 22**, **Express 5**, **Prisma 6.19.3** e **PostgreSQL 16**. O Express serve o frontend, a API e as metatags das páginas públicas na mesma origem. Não há framework frontend, fontes remotas, cadastro ou dados pessoais obrigatórios.

**Deploy em VPS com EasyPanel:** siga [o guia de deploy](deploy/EASYPANEL.md). Use o `Dockerfile` da raiz com Build Path `/` e cadastre os segredos em **App → Environment**. O `.env` local não precisa ser enviado para a VPS.

**SEO de ladopolitico.online:** o [guia de SEO](deploy/SEO.md) explica indexação, palavras-chave, Search Console e validação após deploy. Configure `SEO_URL=https://ladopolitico.online` e `SEO_INDEXING_ENABLED=true` na produção. As cinco páginas públicas têm versões nos quatro idiomas, metadata no servidor, JSON-LD, canonical próprio, hreflang, sitemap e previews PNG; resultados pessoais e administração ficam fora da indexação.

**Idiomas:** português brasileiro, inglês, espanhol e chinês simplificado, com URLs `/pt-br/`, `/en/`, `/es/` e `/zh-cn/`. O [guia de internacionalização](deploy/I18N.md) explica detecção, preferência manual, traduções, compatibilidade de URLs antigas, testes e hospedagem. O seletor preserva respostas e progresso do quiz.

## Executar rapidamente

É necessário Node.js 22+, npm e Docker com Compose. Na raiz:

```sh
cd backend
npm install
npm run setup
cd ..
docker compose up -d --build
```

Abra **http://localhost:3000**. A dashboard está em **http://localhost:3000/admin**. Consulte `ADMIN_PASSWORD` no arquivo local `backend/.env` gerado pelo setup. O setup cria segredos aleatórios e não sobrescreve um `.env` existente. O container executa as migrations antes de iniciar.

O Compose usa `postgres` como hostname interno e mantém o banco em volume persistente. A senha `quiz_local_only` é um exemplo para desenvolvimento. Para outro valor, configure `POSTGRES_PASSWORD` no ambiente do Compose e atualize a URL local caso execute Node fora do container. Caracteres especiais da senha precisam ser codificados na URL. Nunca use a senha de exemplo em produção.

## Desenvolvimento com backend local

Na raiz, suba somente o banco:

```sh
docker compose up -d postgres
cd backend
npm install
npm run setup
npx prisma generate
npx prisma migrate dev
npm run dev
```

`DATABASE_URL` deve apontar para `localhost:5432` nesse modo. Se já houver PostgreSQL local, crie um usuário e um banco dedicados e ajuste a URL. O usuário de desenvolvimento precisa de permissão `CREATEDB` para o shadow database de `migrate dev`. Em um banco gerenciado sem essa permissão, aplique as migrations existentes com `npx prisma migrate deploy`.

Abra sempre o frontend pelo Express (`http://localhost:3000`), inclusive em desenvolvimento. Abrir `index.html` por `file://` não serve a API nem as rotas `/resultado/:uuid` e `/admin`.

## Configuração

Alternativa ao setup: copie `backend/.env.example` para `backend/.env` e preencha os valores.

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL; no Compose o hostname é `postgres` |
| `ADMIN_PASSWORD` | Senha administrativa com pelo menos 12 caracteres |
| `JWT_SECRET` | Segredo aleatório com pelo menos 32 caracteres |
| `APP_URL` | Uma ou mais origens públicas separadas por vírgula, sem subdiretório; usadas nas URLs, Open Graph e proteção de origem |
| `SEO_URL` | Origem principal para canonical e sitemap; deve estar em `APP_URL`. Padrão: primeira origem que não seja localhost |
| `SEO_INDEXING_ENABLED` | `true` na publicação; `false` na homologação. Padrão: habilitado em produção com origem pública, desabilitado localmente |
| `GOOGLE_SITE_VERIFICATION` | Opcional: somente o token da metatag fornecida pelo Search Console |
| `PORT` | Porta do Express; padrão 3000 |
| `NODE_ENV` | `development` local; `production` exige HTTPS em todas as URLs de `APP_URL` e cookie Secure |
| `ABANDONMENT_MINUTES` | Minutos de inatividade; padrão 30 |
| `TRUST_PROXY` | `1` somente com exatamente um proxy confiável; caso contrário `0` |

Para acessar a mesma aplicação por duas URLs em desenvolvimento:

```dotenv
APP_URL=http://localhost:3000,http://example.example
```

Cada domínio precisa apontar para o mesmo backend. A lista aceita espaços entre as URLs e barras finais, que são normalizados; caminhos, parâmetros, credenciais e entradas vazias são recusados. Uma única URL continua válida. Links de conclusão, retomada e compartilhamento, junto das metatags dos resultados pessoais, usam a origem acessada quando ela está na lista. A landing e as páginas editoriais usam `SEO_URL` para canonical e sitemap. A primeira URL de `APP_URL` é a alternativa para links de resultados em acessos internos ou hosts não cadastrados. Não use a lista inteira como um link.

Em produção, use somente origens HTTPS, por exemplo `APP_URL=https://quiz.seudominio.com,https://teste.seudominio.com`. Cadastre ambos os domínios no proxy/EasyPanel, encaminhando ao mesmo serviço e porta. O frontend e a API continuam na mesma origem em cada domínio; não é necessário CORS. Cookies administrativos e o progresso no navegador pertencem a cada origem, enquanto os resultados e métricas continuam no mesmo banco. Não há sincronização automática de login ou de sessão do quiz entre domínios. Reinicie o backend ou faça Deploy depois de alterar a lista.

`.env` e `node_modules` são ignorados pelo Git e pelo build Docker. O `.env` gerado tem permissão 0600. Para gerar um segredo manualmente:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Para alterar a senha, edite `ADMIN_PASSWORD` e reinicie o backend. Para invalidar também todos os logins antigos, altere `JWT_SECRET` e reinicie. Login dura 8 horas, usa cookie HttpOnly/SameSite=Strict e é revogado no banco ao sair. Nenhuma senha fica no frontend. `/admin` exige autenticação e redireciona para `/admin/login`. O endpoint de login é necessariamente a exceção pública em `/api/admin/*`.

## Perguntas e cálculo

**As 40 perguntas anteriores mencionadas no pedido não estavam disponíveis na conversa nem no diretório. O catálogo entregue contém 40 afirmações propostas para o projeto, identificadas como tal, e não uma reprodução daquele questionário.** As regras estão em `backend/src/data/questions.js`; os textos centralizados por ID estão em `frontend/locales/<idioma>/quiz.json`. Há 20 perguntas econômicas e 20 de autoridade, com 10 direções positivas e 10 negativas por eixo e peso 1. Internacionalizar não altera IDs, pesos, scores ou classificações persistidas.

O frontend busca a mesma fonte por `GET /api/quiz/questions`; não existe um segundo questionário divergente. Texto e tópico são enviados ao navegador. Pesos e cálculo oficial ficam no backend. As funções solicitadas estão em `backend/src/utils/scoring.js`.

Para cada eixo:

```text
contribuição = (resposta − 3) × direção × peso
máximo = Σ (2 × |direção| × peso)
score = 100 × Σ(contribuições) / máximo
```

O resultado é limitado a −100..+100 e arredondado a duas casas. O outro eixo nunca entra no cálculo. Neutro produz zero. Concordar com uma questão de direção negativa move o score para o lado negativo.

| Intervalo | Econômico | Autoridade |
| --- | --- | --- |
| [−100, −70) | Extrema esquerda | Libertário radical |
| [−70, −40) | Esquerda | Libertário |
| [−40, −10) | Centro-esquerda | Liberal |
| [−10, +10] | Centro | Centro |
| (+10, +40] | Centro-direita | Autoritário moderado |
| (+40, +70] | Direita | Autoritário |
| (+70, +100] | Direita radical | Autoritário forte |

A categoria política combina esquerda/centro/direita com libertária/centro/autoritária, sem associar automaticamente economia e autoridade. Este é um instrumento exploratório, sem validação psicométrica. Se alterar o catálogo depois de publicar, aumente `QUIZ_VERSION`, ajuste o default no schema por migration e mantenha as versões anteriores caso queira permitir sua retomada. A versão v1 impede concluir uma sessão com um catálogo diferente.

## Sessões, progresso e abandono

`POST /api/quiz/start` gera UUID v4 com `crypto.randomUUID()` e uma chave aleatória de edição. A chave fica no `sessionStorage`; no banco fica apenas seu hash SHA-256. A URL pública não permite ler as respostas nem editar o quiz. Progresso, retomada e conclusão exigem `X-Quiz-Token`.

Cada resposta envia um snapshot JSON ao backend e atualiza `lastActivityAt`. `currentQuestion` é a pergunta exibida, entre 1 e 40; a quantidade de respostas pode ser maior quando o usuário volta para revisar. As respostas devem ser contínuas, com IDs 1..N e inteiros 1..5. A interface exige que a gravação seja confirmada antes de avançar. Em falha de rede, guarda o snapshot pendente na aba e oferece reenviar.

Um job roda a cada minuto, na inicialização e antes das consultas administrativas: `STARTED` sem atividade por mais de 30 minutos vira `ABANDONED`. Não depende de fechar a aba. Uma sessão retomada volta a `STARTED` ao salvar uma resposta. Portanto, a taxa de abandono representa o estado atual, não o histórico de interrupções. A conclusão usa transação e lock de linha, é idempotente e impede que um progresso atrasado rebaixe o resultado. O fechamento da aba encerra o `sessionStorage`; para retomada entre visitas, pode-se trocar explicitamente para `localStorage` considerando a privacidade em computadores compartilhados.

## API REST

Todas as respostas de erro usam `{ "error": "mensagem", "code": "chaveEstavel" }`. O header opcional `X-Language` seleciona o idioma das mensagens, catálogo e rótulos; sem ele, o fallback é português. As URLs localizadas são geradas para o frontend que envia esse header; URLs antigas continuam funcionando.

| Método | Rota | Autorização / comportamento |
| --- | --- | --- |
| GET | `/api/quiz/questions` | Público; catálogo centralizado |
| POST | `/api/quiz/start` | Público; retorna UUID, token e versão |
| GET | `/api/quiz/:uuid` | `X-Quiz-Token`; retoma progresso |
| PATCH | `/api/quiz/:uuid/progress` | `X-Quiz-Token`; `{ currentQuestion, answers }` |
| POST | `/api/quiz/:uuid/complete` | `X-Quiz-Token`; `{ answers }` com exatamente 40 respostas |
| POST | `/api/quiz/:uuid/share` | Público; resultado concluído, marcação idempotente |
| GET | `/api/results/:uuid` | Público; somente classificação, scores, UUID e conclusão |
| POST | `/api/admin/login` | Público com limite de tentativas; `{ password }` |
| POST | `/api/admin/logout` | Cookie administrativo; revoga sessão |
| GET | `/api/admin/stats` | Cookie; contagens e taxas |
| GET | `/api/admin/results` | Cookie; filtros, ordenação e paginação |
| GET | `/api/admin/distribution` | Cookie; agregações por classificação |
| GET | `/api/admin/scatter` | Cookie; pontos paginados sem identificadores |
| GET | `/health` | Público; testa conexão com o banco |

`/api/admin/results?page=1&limit=50` retorna `{ data, page, limit, total, totalPages }`. O limite máximo é 100 e a UI usa 25. Ordenações: `newest`, `oldest`, `economic`, `authority`. Os últimos usam scores decrescentes e colocam scores nulos ao final. A ordenação é estável com desempate interno por ID, que nunca é exposto publicamente.

Filtros compartilhados por todas as consultas administrativas:

```text
status=STARTED|COMPLETED|ABANDONED
shared=yes|no
economic=left|centerLeft|center|centerRight|right
authority=libertarian|liberal|center|authoritarian
```

Omitir o parâmetro ou usar `all` significa todos. `shared=no` conta somente quem concluiu e não compartilhou. Filtros econômicos agregam os extremos às categorias esquerda/direita. Autoridade agrega as três categorias autoritárias em `authoritarian` e as duas libertárias em `libertarian`. Filtros de posicionamento consideram somente resultados concluídos.

Os números e taxas se referem ao recorte ativo. `started` é o total de sessões iniciadas de qualquer status; `active` são apenas `STARTED`. Conclusão = concluídos/iniciados; abandono = abandonados/iniciados; compartilhamento = compartilhados/concluídos. Divisão por zero retorna 0, nunca NaN. Os percentuais aparecem com duas casas na interface. A dashboard consulta novos dados a cada minuto quando visível na primeira página, ou manualmente em Atualizar.

O scatter desenha resultados reais em Canvas. Carrega no máximo 1.000 pontos por requisição e permite carregar os próximos lotes. A contagem de pontos carregados fica visível; não são amostras inventadas e nenhum UUID é enviado ao gráfico. As distribuições consideram todos os resultados filtrados, independentemente da página da tabela ou do gráfico.

## Compartilhamento e Open Graph

A API pública e a conclusão do quiz também retornam `economicView: { score, label }` e `authorityView: { score, label }`. São projeções de `economicScore`/`economicLabel` e `authorityScore`/`authorityLabel`, mantendo os campos anteriores para compatibilidade. Não há novo cálculo, dados coletados ou colunas no banco.

A página pública mostra dois cards, **Visão econômica** e **Visão de autoridade**, cada um com sua pontuação, classificação, escala e leitura textual dos mesmos valores. O mapa, o card baixável e o texto de compartilhamento usam esses campos. Resultados antigos recebem a apresentação nova ao serem consultados, sem recalcular as classificações salvas e sem precisar de uma migration.

Web Share API, WhatsApp, Facebook, X/Twitter, Telegram e copiar link funcionam sem autenticar em APIs de redes sociais. Instagram copia resultado e link e abre o site para o usuário colar manualmente. A URL fica disponível para copiar manualmente caso o navegador bloqueie Clipboard ou novas janelas.

**`shared` mede intenção: clique num botão, não confirmação de publicação externa.** Os navegadores não oferecem confirmação uniforme de postagem. Cancelar a folha nativa de compartilhamento ainda conta como clique. Quem visitar um resultado público também pode compartilhá-lo; o flag pertence ao resultado. Cliques repetidos preservam a primeira data `sharedAt` e nunca criam registros extras.

`/resultado/:uuid` é renderizada pelo Express com título, descrição, canonical, Open Graph e Twitter meta personalizados antes de JavaScript. O resultado individual tem um card SVG dinâmico baixável; algumas redes não aceitam SVG como prévia de imagem e poderão mostrar apenas título e descrição. Não há promessa de preview de imagem em todas as redes. A página pública tem fallback textual quando JavaScript está desligado.

## Privacidade e segurança

Não coletamos nome, email, telefone, CPF, endereço, localização ou conta social. Persistimos respostas, timestamps, status e scores com UUID. O token de edição é um segredo de capacidade, separado do identificador público, necessário para impedir que o link compartilhado autorize alterações. IPs são usados transitoriamente pelo limitador em memória, sem gravação no banco. Não há analytics de terceiros.

Helmet, CSP, limites de corpo JSON, validação estrita, cookies seguros em produção, proteção de origem, limite de tentativas de login, JWT com algoritmo/issuer/audience fixos e sessões revogáveis são aplicados. Respostas administrativas não usam cache. Não ativamos CORS: frontend e API devem compartilhar a mesma origem. Não configure proxies ou observabilidade para gravar corpos das requisições, cookies ou `X-Quiz-Token`.

Resultados públicos são acessíveis a quem possuir o link. UUID v4 dificulta descoberta, mas não substitui controle de acesso quando o conteúdo precisa ser privado. Escolha uma política de retenção para sua implantação; esta versão não elimina automaticamente resultados concluídos.

## Testes

Testes de cálculo e validação, sem banco:

```sh
cd backend
npm test
npm run lint
npm run typecheck
npm run build
```

Integração usa PostgreSQL real e **somente** o schema dedicado `quiz_test`. Os testes recusam a ausência de `TEST_DATABASE_URL` ou um schema diferente. Não execute contra produção. Com o banco local de desenvolvimento:

```sh
cd backend
export TEST_DATABASE_URL='postgresql://quiz:quiz_local_only@localhost:5432/quiz?schema=quiz_test'
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
npm run test:integration
```

Testes de navegador iniciam o Express na porta 3001 usando o mesmo schema de teste. Execute depois da integração, sem concorrência entre as duas suítes:

```sh
npx playwright install chromium
npm run test:e2e
```

O navegador testa o quiz completo, retomada, resultado público, compartilhamento, login administrativo, filtros, layout móvel e os quatro idiomas. Artefatos de teste ficam em `test-results/`, ignorado pelo Git. Em máquinas com Chrome instalado, `PLAYWRIGHT_CHROME=1 npm run test:e2e` usa esse navegador. `npm run test:i18n` executa somente os testes unitários de internacionalização. A checagem de tipos cobre o módulo compartilhado de configuração via JSDoc; o restante permanece JavaScript. `build` gera Prisma e valida lint/tipos/i18n; a imagem de produção é verificada por `npm run test:docker`.

## Deploy

1. Provisione PostgreSQL persistente, com usuário dedicado, backups e TLS conforme seu provedor. O volume do Compose é para armazenamento persistente local; não é um backup.
2. Configure as variáveis como segredos no serviço, com `NODE_ENV=production`, uma senha forte e `APP_URL=https://seu-dominio.com`.
3. Gere o client (`npm ci`, que executa `prisma generate`) e aplique `npx prisma migrate deploy`, não `migrate dev`. A migration inicial está versionada.
4. Inicie com `npm start`, ou construa a imagem na raiz: `docker build -t prisma-quiz .`. A imagem tem `NODE_ENV=production`, usuário sem privilégios, healthcheck e Tini; valida as variáveis e aplica as migrations antes de iniciar o Node. Para EasyPanel, cadastre os valores em App → Environment conforme [o guia](deploy/EASYPANEL.md).
5. Coloque Express atrás de um proxy que termine HTTPS e encaminhe o host e protocolo corretamente. Use `TRUST_PROXY=1` apenas se houver exatamente um proxy confiável. Proteja o acesso direto ao backend.
6. Em cada domínio listado em `APP_URL`, sirva frontend e API juntos pelo Express, que também entrega o SSR do resultado. Não publique `/admin.html` por um servidor estático separado.
7. Valide `/health`, login, cookie Secure, URLs compartilhadas e o fluxo completo no domínio de produção.

Para Compose em produção, exporte `POSTGRES_PASSWORD` forte, use a mesma configuração em `backend/.env` e ajuste `NODE_ENV`, `APP_URL`, `TRUST_PROXY`. Não exponha a porta PostgreSQL fora de localhost; se não precisar de acesso local, remova seu mapeamento de portas. O job de abandono roda em cada processo e sua atualização condicional é segura; para muitas réplicas, o rate limit deve migrar para um store compartilhado, pois a implementação atual é por processo.

As dependências têm versões fixas e lockfile. `deepmerge-ts` usa override 8.0.2 para corrigir uma dependência transitiva do CLI Prisma. Referências: [Prisma Migrate 6](https://www.prisma.io/docs/orm/v6/prisma-migrate/getting-started), [migrations em produção](https://www.prisma.io/docs/orm/v6/prisma-client/deployment/deploy-database-changes-with-prisma-migrate), [PostgreSQL no Prisma](https://www.prisma.io/docs/orm/v6/overview/databases/postgresql).

## Estrutura

```text
frontend/
  index.html, resultado.html, admin.html, admin-login.html
  css/style.css, resultado.css, admin.css
  js/app.js, resultado.js, admin.js, common.js
  assets/mark.svg
backend/
  src/controllers, routes, services, middlewares, utils, data
  src/app.js, config.js, server.js
  prisma/schema.prisma, migrations/
  scripts/setup-env.js, healthcheck.js
  docker-entrypoint.sh
  tests/, playwright.config.js
  package.json, package-lock.json, .env.example, Dockerfile
Dockerfile, docker-compose.yml
deploy/EASYPANEL.md, easypanel.env.example
```
