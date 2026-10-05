#!/bin/sh
set -eu

cd /app/backend

# Validação antecipada: usa process.env, sem exigir um arquivo .env.
node --input-type=module -e 'import "./src/config.js";'

# Falha de configuração/conexão/migration impede servir uma versão incompatível.
# Usa o binário instalado na imagem, sem baixar pacotes na inicialização.
printf '%s\n' 'Aplicando migrations de produção...'
./node_modules/.bin/prisma migrate deploy

# exec permite que SIGTERM alcance o Node para seu encerramento gracioso.
exec "$@"
