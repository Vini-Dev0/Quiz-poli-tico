# SEO de ladopolitico.online

O objetivo da página inicial é atender às buscas **quiz político**, **quiz lado político**, **descobrir meu lado político**, **teste político** e **teste de posicionamento político**. O título, H1, chamada principal e perguntas frequentes usam essas expressões em conteúdo visível. As páginas de apoio explicam cálculo, privacidade, funcionamento e limites do teste. Não criamos páginas repetidas para cada variação da mesma busca.

## O que está implementado

- Título e descrição únicos por página, renderizados pelo Express.
- Canonical da landing e páginas editoriais concentrado em `SEO_URL`, mesmo com múltiplas origens em `APP_URL`.
- `WebSite`, `WebPage`/`AboutPage` e breadcrumbs em JSON-LD com nonce compatível com CSP. Sem avaliações fictícias, FAQ rich result ou caixa de busca inexistente.
- Vinte URLs editoriais em `/sitemap.xml` (cinco páginas nos quatro idiomas), com referências multilíngues; nenhum UUID, resultado de participante ou página administrativa é incluído.
- Conteúdo, metadados e JSON-LD localizados, canonical próprio em cada idioma, hreflang recíproco `pt-BR`, `en`, `es`, `zh-Hans` e `x-default`. A raiz é uma seleção de idiomas; veja o [guia de internacionalização](I18N.md).
- `/robots.txt` permite HTML, CSS, JavaScript e imagens públicas. Os resultados podem ser rastreados para que o buscador leia seu `noindex`.
- Resultados, APIs, administração e erros recebem `X-Robots-Tag: noindex`. Resultados continuam funcionando por link e com Open Graph personalizado.
- Open Graph/Twitter nas páginas públicas, preview PNG 1200×630 e ícones locais.
- HTML e assets públicos comprimidos, templates em memória, fontes do sistema, dimensões definidas nos ícones e layout responsivo. Sem biblioteca frontend ou serviço de tracking novo.
- URLs antigas redirecionam temporariamente para o idioma preferido; os prefixos e barras finais são normalizados sem ciclos. URLs inexistentes continuam respondendo 404.
- Indexação desligada em desenvolvimento e configurável na homologação.

## Publicar no EasyPanel

Em **App → Environment**, ajuste as variáveis e faça **Deploy**:

```dotenv
NODE_ENV=production
APP_URL=https://ladopolitico.online
SEO_URL=https://ladopolitico.online
SEO_INDEXING_ENABLED=true
TRUST_PROXY=1
```

Preserve as variáveis do banco e da autenticação. Se existir outro domínio da mesma aplicação, adicione sua origem HTTPS em `APP_URL`, separada por vírgula. `SEO_URL` precisa corresponder a uma dessas origens. Não coloque localhost na configuração de produção. No ambiente local, as origens HTTP continuam aceitas e o `.env` permanece fora da imagem.

`SEO_URL` é o domínio de preferência para Google e sitemap. Links de resultados pessoais continuam usando o domínio acessado, preservando o funcionamento nos dois endereços. Se a variável não for preenchida, o sistema escolhe a primeira origem que não seja localhost. Canonical é um sinal de preferência, e a escolha final é do Google. [Orientação oficial sobre canonicals](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).

Em homologação, use `SEO_INDEXING_ENABLED=false`. Isso adiciona `noindex` ao conteúdo e desativa o sitemap; publicar com esse valor impede a indexação desejada. Para concentrar todo o acesso em um único domínio no futuro, você também pode configurar redirecionamentos permanentes no proxy, desde que aceite mudar a navegação nos aliases.

Após o deploy, confira as páginas públicas e rode na pasta `backend`:

```sh
npm run seo:check -- https://ladopolitico.online
```

Esse comando verifica as 20 páginas, canonical, hreflang, sitemap e previews da aplicação publicada, sem senha administrativa ou acesso ao banco. Ele não consulta posição em buscadores nem comprova que o Googlebot real conseguiu acessar a VPS.

## Fazer o Google encontrar e medir o site

1. Adicione `ladopolitico.online` como propriedade de domínio no [Google Search Console](https://search.google.com/search-console/). Verifique a propriedade pelo registro DNS fornecido pelo Google.
2. Se preferir propriedade com prefixo de URL e verificação por metatag, preencha `GOOGLE_SITE_VERIFICATION` apenas com o token, salve e faça Deploy. O backend coloca a metatag na página inicial. Não use valores de exemplo como token real.
3. Envie `https://ladopolitico.online/sitemap.xml` no relatório de sitemaps. Inspecione a página inicial e a metodologia e confira se o Google consegue ler o conteúdo e o canonical.
4. Acompanhe consultas, impressões, cliques, CTR e páginas no relatório de desempenho. Verifique tanto as expressões-alvo quanto variações reais que surgirem. Use esses dados para ajustar conteúdo e títulos.

As ações de verificação e envio precisam ser feitas na sua conta: o código não registra automaticamente a propriedade nem garante indexação. [Documentação do Search Console](https://developers.google.com/search/docs/monitor-debug/search-console-start).

## Como melhorar além do código

- Publique conteúdo original que responda dúvidas reais: como interpretar os dois valores do mapa, o que uma resposta neutra faz no cálculo e quais são os limites do instrumento. Use exemplos do próprio teste, fontes confiáveis quando fizer afirmações externas e revisão editorial. Não replique o mesmo texto em páginas com palavras-chave trocadas.
- Acrescente a identidade real do responsável pelo projeto, um canal de contato funcional e informações verificáveis sobre autoria e revisão. A página Sobre atual descreve o produto sem inventar credenciais ou especialistas.
- Divulgue o teste em contextos relevantes e busque referências espontâneas de outros sites. Evite compra de links, páginas artificiais e texto escondido. [Guia de SEO do Google](https://developers.google.com/search/docs/fundamentals/seo-starter-guide).
- Avalie o domínio publicado no [PageSpeed Insights](https://pagespeed.web.dev/). Observe LCP, INP e CLS em dados de usuários reais. Como referência, o Google recomenda LCP até 2,5 s, INP abaixo de 200 ms e CLS abaixo de 0,1. Resultados locais de laboratório não comprovam esses valores na VPS. [Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals).
- Mantenha domínio, HTTPS, disponibilidade, banco e backups funcionando. Reavalie mudanças com o comando `seo:check`, testes e Search Console.

SEO técnico prepara o site para ser entendido e rastreado. Ele não garante primeiro lugar: conteúdo, relevância, referências externas, concorrência e as decisões do buscador também influenciam o resultado.

## Manutenção

As definições de páginas ficam em `backend/src/data/site-pages.js`, com os textos em `frontend/locales/<idioma>/pages.json`. O sitemap usa a mesma lista das rotas e o registro compartilhado de idiomas; ao adicionar uma página pública nesse catálogo e traduzi-la nos quatro recursos, ela ganha rota e entradas multilíngues no sitemap. A landing está em `frontend/index.html`; as páginas editoriais usam `frontend/info.html` e `frontend/css/info.css`.

Ao modificar o layout do preview SVG ou do ícone, regenere os PNGs com dependências de desenvolvimento instaladas:

```sh
npm run assets:build
# Ou, com Chrome instalado:
PLAYWRIGHT_CHROME=1 npm run assets:build
```

Os PNGs são versionados. Chrome e Playwright não são necessários no container de produção. Não há `lastmod` fictício no sitemap; inclua esse campo somente quando houver controle real da data de atualização do conteúdo.
