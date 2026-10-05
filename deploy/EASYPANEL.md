# Deploy do Prisma no EasyPanel

O `Dockerfile` na raiz entrega frontend, API, páginas públicas e administração em uma única imagem. Ele instala dependências de produção, gera o Prisma Client, inclui as migrations, executa como usuário `node`, possui healthcheck e usa Tini para encaminhar sinais e encerrar o servidor corretamente.

**O `.env` local não precisa ir para a VPS.** Cadastre suas informações no EasyPanel em **Projeto → serviço App da aplicação → Environment / Variáveis de ambiente**. O painel injeta os valores em `process.env` quando cria o container. Deixe **Create env file** desativado. O Dockerfile não declara argumentos de build para senhas e não incorpora variáveis secretas nas camadas da imagem. O `.dockerignore` exclui arquivos `.env`, incluindo variações e subpastas.

## 1. Criar o banco

1. Abra ou crie um projeto no EasyPanel, por exemplo `prisma`.
2. Selecione **New Service → Postgres** e dê um nome ao banco, por exemplo `database`.
3. Defina uma senha forte ou use a senha gerada pelo EasyPanel. Para uma instalação nova, PostgreSQL 16 é compatível com o projeto; um serviço PostgreSQL existente pode ser usado sem trocar sua versão.
4. Aguarde o banco iniciar e abra **Credentials**.
5. Copie a **Internal Connection URL / URL de conexão interna**. Ela será o valor de `DATABASE_URL` na aplicação.

Use a URL exata fornecida pelo painel: o hostname interno é definido pelo projeto/serviço, e não é `localhost`. Aplicação e banco devem estar no mesmo projeto para esta configuração. Mantenha a conexão e o armazenamento persistente gerenciados pelo serviço Postgres. Configure os backups na aba **Backups** desse serviço.

Uma URL interna tem um formato parecido com:

```text
postgresql://USUARIO:SENHA@HOST_INTERNO:5432/BANCO?sslmode=disable
```

O Prisma aceita `postgres://` e `postgresql://`. Preserve os parâmetros que o painel fornecer. O schema padrão é `public`; se quiser explicitá-lo, adicione `&schema=public` quando já existir `?sslmode=disable`, ou `?schema=public` se não houver parâmetros. A senha dentro da URL deve estar codificada corretamente; copiar a URL gerada pelo painel evita montar credenciais manualmente.

## 2. Criar o serviço da aplicação

1. No mesmo projeto, selecione **New Service → App**, por exemplo `quiz`.
2. Em **Source**, selecione **GitHub**, **Git** ou **Upload** para fornecer o código completo.
3. Para Git/GitHub, configure repositório, branch e **Build Path = `/`** (raiz do projeto).
4. Em **Build**, escolha **Dockerfile**, com **Dockerfile Path = `Dockerfile`**.

O contexto de build precisa conter as pastas `backend/` e `frontend/`. Se usar Upload, organize o arquivo compactado com `Dockerfile`, `backend/` e `frontend/` na raiz extraída, sem `node_modules` nem segredos locais. O arquivo `backend/package-lock.json` e a pasta `backend/prisma/migrations/` devem estar presentes.

Use o builder Dockerfile com uma fonte de código. A opção **Source → Dockerfile inline** não disponibiliza automaticamente os arquivos do repositório para as instruções `COPY`.

O Dockerfile em `backend/Dockerfile` foi mantido equivalente para compatibilidade, mas também exige contexto na raiz. A configuração recomendada para o EasyPanel usa o Dockerfile da raiz.

## 3. Cadastrar as informações do `.env`

Abra **serviço App `quiz` → Environment** e cole o conteúdo abaixo, substituindo os exemplos:

```dotenv
NODE_ENV=production
PORT=3000
APP_URL=https://quiz.seudominio.com
DATABASE_URL=replace-with-the-internal-postgres-url-from-easypanel
ADMIN_PASSWORD=replace-with-a-random-admin-password
JWT_SECRET=replace-with-a-random-secret-at-least-32-characters
ABANDONMENT_MINUTES=30
TRUST_PROXY=1
```

Há uma cópia em [easypanel.env.example](easypanel.env.example). Os valores `replace-with-...` são exemplos; a aplicação os recusa até serem substituídos.

| Variável | Valor a preencher |
| --- | --- |
| `NODE_ENV` | `production`, para ativar cookies Secure e proteções de produção |
| `PORT` | `3000`, a mesma porta de destino do domínio |
| `APP_URL` | Uma ou mais origens HTTPS separadas por vírgula, por exemplo `https://quiz.seudominio.com,https://teste.seudominio.com`; sem `/admin`, `/api` ou outro caminho |
| `DATABASE_URL` | URL interna copiada do Postgres em Credentials |
| `ADMIN_PASSWORD` | Senha administrativa forte com pelo menos 12 caracteres |
| `JWT_SECRET` | Segredo aleatório com pelo menos 32 caracteres, diferente da senha administrativa |
| `ABANDONMENT_MINUTES` | `30` |
| `TRUST_PROXY` | `1` para o acesso via um único proxy confiável do EasyPanel |

Para gerar valores aleatórios no terminal de uma máquina com Node.js:

```sh
# Gere a senha administrativa e copie o resultado para ADMIN_PASSWORD.
node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))"

# Gere outro valor e copie para JWT_SECRET.
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Esses comandos são executados por você no terminal e não fazem parte do build ou dos logs de deploy. Guarde os valores no painel e no seu gerenciador de senhas. O serviço App guarda a senha administrativa; o serviço Postgres guarda sua própria senha de banco. São credenciais diferentes.

O valor `TRUST_PROXY=1` pressupõe que há exatamente um proxy entre o navegador e o Express e que o container está acessível pelo proxy. Se acrescentar outro proxy ao caminho, revise a configuração de confiança e o rate limit para essa topologia. Para começar, use um domínio encaminhado diretamente ao proxy do EasyPanel.

Clique em **Save / Salvar**. Uma alteração nas variáveis precisa de **Deploy** para chegar ao container em execução. O backend usa os valores fornecidos pelo painel sem depender de um arquivo `.env`.

## 4. Configurar domínio e HTTPS

Em **Domains**, configure:

| Campo | Valor |
| --- | --- |
| Hostname | `quiz.seudominio.com` ou o domínio que você realmente usar |
| Caminho público | `/` |
| Protocolo interno | `HTTP` |
| Porta de destino / Target port | `3000` |
| HTTPS público | Habilitado, com certificado válido |

Aponte o DNS do domínio para a VPS, marque esse domínio como principal e coloque sua origem HTTPS em `APP_URL`. Para dois domínios, adicione uma entrada em **Domains** para cada hostname, ambas com caminho `/`, protocolo interno HTTP, porta 3000 e HTTPS público habilitado. Use a lista em **Environment**, por exemplo:

```dotenv
APP_URL=https://quiz.seudominio.com,https://teste.seudominio.com
```

Os links de resultado e as metatags preservam o domínio acessado. A primeira URL é usada como alternativa para solicitações internas ou hosts não cadastrados. Uma única origem continua sendo aceita. Cada domínio mantém seu próprio cookie administrativo e progresso no navegador; o banco e as métricas são compartilhados.

O proxy termina o HTTPS e encaminha HTTP para a aplicação em `0.0.0.0:3000`. O HTTPS público é necessário para o cookie administrativo Secure, e todas as URLs da lista devem usar HTTPS quando `NODE_ENV=production`. O exemplo `http://localhost:3000,http://example.example` é aceito em desenvolvimento. Mantenha a porta HTTP acessível por **Domains**; não é necessário publicar a porta 3000 como porta TCP externa em Advanced → Ports.

## 5. Fazer o deploy

1. Confirme que o Postgres está iniciado e que as variáveis foram salvas.
2. Mantenha o comando padrão da imagem. Em **Advanced → Deploy**, comece com **1 réplica**.
3. Clique em **Deploy** e acompanhe o build e os logs da aplicação.

O build não precisa se conectar ao banco nem receber senha administrativa. Na inicialização, o container valida as variáveis, executa o `prisma migrate deploy` instalado na imagem e só então inicia o servidor. Erros de configuração, banco ou migration encerram o container sem servir uma versão incompatível.

As migrations existentes criam as tabelas no primeiro deploy; nos seguintes, somente migrations pendentes são aplicadas. Para o banco alvo, o usuário de conexão precisa de permissão para criar as tabelas e índices definidos pelas migrations. O comando de produção não usa o shadow database de `migrate dev`.

Teste no seu domínio:

```text
https://quiz.seudominio.com/health  → {"status":"ok"}
https://quiz.seudominio.com/        → landing page e quiz
https://quiz.seudominio.com/admin   → login administrativo
```

Faça um quiz completo, abra a URL `/resultado/UUID`, copie o link e confira o resultado na dashboard. O healthcheck Docker consulta `/health` na porta configurada e verifica o PostgreSQL por meio da aplicação.

Uma réplica atende a configuração atual de rate limit, cujo armazenamento é por processo. Para distribuir tráfego entre várias réplicas, implemente um store compartilhado para o limitador. O job de abandono e as migrations usam operações seguras no banco, mas isso não transforma o limitador em um contador global.

## 6. Alterar variáveis depois do deploy

Edite as informações em **App → Environment → Save → Deploy**. Ao alterar o domínio, ajuste `APP_URL`; ao alterar a senha do banco, atualize `DATABASE_URL`. Para mudar o acesso administrativo, altere `ADMIN_PASSWORD`. Se também quiser invalidar logins antigos, altere `JWT_SECRET`.

O frontend usa URLs relativas para a API e o backend entrega os metadados das páginas públicas. Trocar o domínio depende da configuração em runtime, sem recompilar JavaScript com segredos.

## Diagnóstico

| Sintoma | O que conferir |
| --- | --- |
| Build informa que não encontrou `backend/` ou `frontend/` | Build Path deve ser `/`; confira a raiz do arquivo enviado por Upload |
| Erro “Configure a variável de ambiente…” | Salve o valor real em Environment e faça Deploy |
| Prisma não conecta ao banco | Copie a URL interna de Credentials, confirme que o banco está ativo e os serviços estão no mesmo projeto |
| Erro de autenticação PostgreSQL | Confira o usuário, a senha e sua codificação na URL |
| Migration falhou | Leia os logs; corrija a migration/permite acesso ao banco antes de reiniciar; não use reset no banco de produção |
| Domínio retorna 502 ou healthcheck falha | Confira logs, porta 3000, processo iniciado e resultado de `/health` |
| Login administrativo não mantém sessão | Use o domínio HTTPS com certificado válido e confirme `NODE_ENV=production` |
| Resposta “Origem não autorizada” | A origem acessada precisa corresponder a uma das URLs de `APP_URL`, incluindo protocolo e porta |
| Resultados apontam para a primeira URL | Confira se a origem acessada está na lista e se o proxy encaminha o host e o protocolo corretos; ajuste `APP_URL` e faça Deploy |

## Verificação local da imagem

Para construir, execute na raiz do projeto:

```sh
docker build -t prisma-quiz:production .
```

Para executar localmente por Docker com seu arquivo de desenvolvimento:

```sh
docker run --rm --name prisma-quiz-local-app -p 3000:3000 \
  --env-file backend/.env \
  -e NODE_ENV=development \
  -e DATABASE_URL='postgresql://USUARIO:SENHA@host.docker.internal:PORTA/BANCO?schema=public' \
  prisma-quiz:production
```

Substitua a URL pelo banco local. `host.docker.internal` funciona no Docker Desktop; em uma VPS com EasyPanel use a URL interna do serviço Postgres. O `--env-file` apenas injeta valores no container em runtime: não copia o arquivo para a imagem. Para Docker sem painel em Linux, configure o banco na rede Docker e ajuste a URL para o nome desse serviço.

Para repetir a validação automatizada da imagem, com Docker ativo:

```sh
cd backend
npm run test:docker
```

Esse teste constrói a imagem, cria uma rede e um PostgreSQL descartáveis, injeta segredos aleatórios em runtime, verifica o fluxo do quiz e o cookie Secure, testa reinício e SIGTERM e remove os recursos de teste. Ele não usa o `.env` nem o banco local da aplicação. Para usar outra imagem PostgreSQL disponível localmente, defina `DEPLOYMENT_TEST_POSTGRES_IMAGE` antes do comando.

Referências oficiais: [App e variáveis de ambiente](https://easypanel.io/docs/services/app), [Build Path e Dockerfile](https://easypanel.io/docs/builders), [Postgres e URL interna](https://easypanel.io/docs/services/postgres).
