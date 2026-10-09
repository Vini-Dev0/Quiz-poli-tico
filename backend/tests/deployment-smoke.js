import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Cria recursos descartáveis com nomes próprios. Não usa o banco do projeto
// nem lê .env; todos os segredos abaixo existem só durante este teste.
const root = fileURLToPath(new URL('../../', import.meta.url));
const suffix = randomBytes(6).toString('hex');
const network = `quiz-deploy-test-${suffix}`;
const app = `${network}-app`;
const database = `${network}-db`;
const image = process.env.DEPLOYMENT_TEST_IMAGE || 'prisma-quiz:production';
const postgresImage = process.env.DEPLOYMENT_TEST_POSTGRES_IMAGE || 'postgres:16-alpine';
const password = randomBytes(24).toString('hex');
const adminPassword = randomBytes(24).toString('hex');
const docker = (args, options = {}) => execFileSync('docker', args, {
  cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options
}).trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function untilHealthy() {
  for (let i = 0; i < 45; i++) {
    try { docker(['exec', app, 'node', 'scripts/healthcheck.js']); return; }
    catch { await sleep(1000); }
  }
  throw new Error('A imagem não ficou pronta em 45 segundos. Consulte os logs do container de teste.');
}
try {
  console.log('Construindo a imagem sem .env e sem segredos de build...');
  docker(['build', '-f', 'Dockerfile', '-t', image, '.']);
  const inspection = JSON.parse(docker(['image', 'inspect', image]))[0];
  assert.equal(inspection.Config.User, 'node');
  assert.deepEqual(inspection.Config.Healthcheck.Test, ['CMD', 'node', 'scripts/healthcheck.js']);
  assert.equal(inspection.Config.Env.some(value => /^(DATABASE_URL|ADMIN_PASSWORD|JWT_SECRET)=/.test(value)), false);
  docker(['run', '--rm', '--entrypoint', 'node', image, '--input-type=module', '-e',
    'import fs from "node:fs"; import assert from "node:assert/strict"; for (const path of ["/app/.env","/app/backend/.env","/app/frontend/.env"]) assert.equal(fs.existsSync(path),false); assert.equal(fs.existsSync("/app/frontend/index.html"),true); assert.equal(fs.existsSync("/app/backend/prisma/migrations"),true);']);
  console.log('Imagem validada: usuário node, frontend, migrations e healthcheck; nenhum .env ou segredo incorporado.');

  docker(['network', 'create', network]);
  docker(['run', '-d', '--name', database, '--network', network,
    '-e', 'POSTGRES_USER=quiz', '-e', 'POSTGRES_DB=quiz', '-e', 'POSTGRES_PASSWORD', postgresImage],
    { env: { ...process.env, POSTGRES_PASSWORD: password } });
  let databaseReady = false;
  for (let i = 0; i < 30; i++) {
    try { docker(['exec', database, 'pg_isready', '-h', '127.0.0.1', '-U', 'quiz', '-d', 'quiz']); databaseReady = true; break; }
    catch { await sleep(1000); }
  }
  assert.equal(databaseReady, true, 'PostgreSQL de teste não ficou pronto.');

  docker(['run', '-d', '--name', app, '--network', network,
    '-e', 'APP_URL=https://quiz.example.com,https://test.example.com', '-e', 'TRUST_PROXY=1',
    '-e', 'SEO_URL=https://quiz.example.com', '-e', 'SEO_INDEXING_ENABLED=true',
    '-e', 'DATABASE_URL', '-e', 'ADMIN_PASSWORD', '-e', 'JWT_SECRET', image],
    { env: { ...process.env, DATABASE_URL: `postgresql://quiz:${password}@${database}:5432/quiz?schema=public`, ADMIN_PASSWORD: adminPassword, JWT_SECRET: randomBytes(48).toString('hex') } });
  await untilHealthy();
  console.log('Inicialização em produção validada: variáveis em runtime, migrations e PostgreSQL real.');

  // O script é enviado por stdin. A senha do teste é lida do runtime,
  // nunca interpolada no comando, na imagem ou nos logs.
  const flow = `
    import assert from 'node:assert/strict';
    const origin = 'http://127.0.0.1:3000';
    const publicOrigins = process.env.APP_URL.split(',');
    const proxyHeaders = url => ({Origin:url, 'X-Forwarded-Host':new URL(url).host, 'X-Forwarded-Proto':'https'});
    async function api(path, method='GET', body, headers={}) {
      const response = await fetch(origin + '/api' + path, {
        method, headers: {'Content-Type':'application/json', ...proxyHeaders(publicOrigins[0]), ...headers},
        ...(body ? {body:JSON.stringify(body)} : {})
      });
      assert.ok(response.ok, method + ' ' + path + ': ' + response.status);
      return {data:await response.json(), cookie:response.headers.get('set-cookie')};
    }
    const landing = await fetch(origin+'/pt-br/');
    const landingHtml = await landing.text();
    assert.match(landingHtml, /Descubra seu/);
    assert.ok(landingHtml.includes('<link rel="canonical" href="'+publicOrigins[0]+'/pt-br/">'));
    const robots = await fetch(origin+'/robots.txt');
    assert.ok((await robots.text()).includes('Sitemap: '+publicOrigins[0]+'/sitemap.xml'));
    const sitemap = await fetch(origin+'/sitemap.xml');
    assert.equal(((await sitemap.text()).match(/<loc>/g)||[]).length,20);
    const catalogue = (await api('/quiz/questions')).data;
    assert.equal(catalogue.total,40);
    const started = (await api('/quiz/start','POST')).data;
    const answers = Object.fromEntries(catalogue.questions.map(q=>[q.id,3]));
    const result = (await api('/quiz/'+started.uuid+'/complete','POST',{answers},{'X-Quiz-Token':started.token})).data;
    assert.equal(result.politicalLabel,'Centro');
    for (const publicOrigin of publicOrigins) {
      const headers = proxyHeaders(publicOrigin);
      const url = publicOrigin + '/resultado/' + started.uuid;
      const completed = (await api('/quiz/'+started.uuid+'/complete','POST',{answers},{...headers,'X-Quiz-Token':started.token})).data;
      assert.equal(completed.resultUrl,url);
      const resumed = (await api('/quiz/'+started.uuid,'GET',undefined,{...headers,'X-Quiz-Token':started.token})).data;
      assert.equal(resumed.resultUrl,url);
      const publicResult = await fetch(origin + '/pt-br/resultado/' + started.uuid,{headers});
      assert.match(publicResult.headers.get('x-robots-tag'),/noindex/);
      const html = await publicResult.text();
      assert.match(html,/og:title/);
      assert.ok(html.includes('<link rel="canonical" href="'+url.replace('/resultado/','/pt-br/resultado/')+'">'));
      assert.ok(html.includes('<meta property="og:image" content="'+url.replace('/resultado/','/pt-br/resultado/')+'/card.svg">'));
    }
    await api('/quiz/'+started.uuid+'/share','POST');
    const login = await api('/admin/login','POST',{password:process.env.ADMIN_PASSWORD});
    assert.match(login.cookie,/HttpOnly/); assert.match(login.cookie,/Secure/); assert.match(login.cookie,/SameSite=Strict/);
    const cookie = login.cookie.split(';')[0];
    const stats = (await api('/admin/stats','GET',undefined,{Cookie:cookie})).data;
    assert.equal(stats.completed,1); assert.equal(stats.shared,1);
    await api('/admin/logout','POST',undefined,{Cookie:cookie});
    const secondHeaders = proxyHeaders(publicOrigins[1]);
    const secondLogin = await api('/admin/login','POST',{password:process.env.ADMIN_PASSWORD},secondHeaders);
    assert.match(secondLogin.cookie,/Secure/);
    await api('/admin/stats','GET',undefined,{...secondHeaders,Cookie:secondLogin.cookie.split(';')[0]});
    await api('/admin/logout','POST',undefined,{...secondHeaders,Cookie:secondLogin.cookie.split(';')[0]});
    const blocked = await fetch(origin+'/api/quiz/start',{method:'POST',headers:{Origin:'https://evil.example'}});
    assert.equal(blocked.status,403);
    console.log('Fluxo do container validado em duas URLs: quiz, links, Open Graph, compartilhamento e administração com cookie Secure.');
  `;
  console.log(docker(['exec', '-i', app, 'node', '--input-type=module', '-'], { input: flow }));
  console.log(docker(['exec', app, 'node', 'scripts/seo-check.js', 'http://127.0.0.1:3000', 'https://quiz.example.com']));
  docker(['restart', app]);
  await untilHealthy();
  docker(['exec', app, 'node', '--input-type=module', '-e',
    'import {PrismaClient} from "@prisma/client"; const db=new PrismaClient(); const count=await db.quizSession.count(); await db.$disconnect(); if(count!==1) process.exit(1);']);
  docker(['stop', '-t', '15', app]);
  assert.equal(docker(['inspect', '--format', '{{.State.ExitCode}}', app]), '0');
  console.log('Reinício preservou o resultado; SIGTERM encerrou a aplicação com código 0.');
} finally {
  for (const container of [app, database]) {
    try { docker(['rm', '-f', '-v', container]); } catch { /* Pode não ter sido criado se o build falhar. */ }
  }
  try { docker(['network', 'rm', network]); } catch { /* Pode não ter sido criada. */ }
}
