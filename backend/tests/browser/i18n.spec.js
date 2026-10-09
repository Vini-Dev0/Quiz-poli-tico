import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { locales } from '../../../frontend/js/i18n-config.js';
import { calculateResult } from '../../src/utils/scoring.js';
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
const resources = Object.fromEntries(locales.map(locale => [locale.code, Object.fromEntries(['ui','quiz','results','messages'].map(namespace => [namespace,JSON.parse(readFileSync(new URL(`../../../frontend/locales/${locale.code}/${namespace}.json`,import.meta.url),'utf8'))]))]));
test.beforeAll(async () => { await db.quizSession.deleteMany(); await db.adminSession.deleteMany(); });
test.afterAll(async () => { await db.quizSession.deleteMany(); await db.adminSession.deleteMany(); await db.$disconnect(); });
async function selectLanguage(page, code) {
  await page.locator('.language-selector summary').click();
  await page.locator(`.language-selector [data-language="${code}"]`).click();
  await expect(page.locator('html')).toHaveAttribute('lang',code);
}
test('detecção no navegador, preferência manual, URL explícita e armazenamento bloqueado', async ({ browser }) => {
  for (const [locale,prefix] of [['pt-PT','pt-br'],['en-US','en'],['es-MX','es'],['zh-CN','zh-cn'],['zh-SG','zh-cn'],['zh-TW','pt-br'],['de-DE','pt-br']]) {
    const context = await browser.newContext({locale});
    try { const page = await context.newPage(); await page.goto('http://localhost:3001/?source=language'); await expect(page).toHaveURL(`http://localhost:3001/${prefix}/?source=language`); }
    finally { await context.close(); }
  }
  const context = await browser.newContext({locale:'en-US'});
  try {
    await context.addInitScript(() => localStorage.setItem('prisma.language','es'));
    const page = await context.newPage();
    await page.goto('http://localhost:3001/');
    await expect(page).toHaveURL('http://localhost:3001/es/');
    await page.goto('http://localhost:3001/zh-cn/');
    await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
  } finally { await context.close(); }
  const blocked = await browser.newContext({locale:'en-US'});
  try {
    await blocked.addInitScript(() => { for (const property of ['localStorage','sessionStorage']) Object.defineProperty(window,property,{get(){ throw new Error('blocked storage'); }}); });
    const page = await blocked.newPage();
    await page.goto('http://localhost:3001/');
    await expect(page).toHaveURL('http://localhost:3001/en/');
    await selectLanguage(page,'es');
    await page.locator('[data-start]').last().click();
    await page.getByRole('radio').nth(3).check();
    await expect(page.locator('#next-question')).toBeEnabled();
    await selectLanguage(page,'zh-CN');
    await expect(page.getByRole('radio').nth(3)).toBeChecked();
  } finally { await blocked.close(); }
});
test('SSR completo sem JavaScript, acesso direto e conteúdo móvel nos quatro idiomas', async ({ browser }) => {
  const context = await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
  try {
    const page = await context.newPage();
    for (const locale of locales) for (const path of ['/','/metodologia','/sobre','/privacidade','/perguntas-frequentes']) {
      const response = await page.goto(`http://localhost:3001/${locale.prefix}${path}`);
      expect(response.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang',locale.code);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',`http://localhost:3001/${locale.prefix}${path}`);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await expect(page.locator('link[hreflang]')).toHaveCount(5);
      if (path === '/') await expect(page.locator('.answer-option').first()).toContainText(resources[locale.code].quiz.answers['1']);
    }
    await page.goto('http://localhost:3001/zh-cn/metodologia');
    await page.screenshot({path:'../test-results/i18n-methodology-zh-mobile.png',fullPage:true});
    await page.goto('http://localhost:3001/en/');
    await page.screenshot({path:'../test-results/i18n-home-en-mobile.png',fullPage:true});
  } finally { await context.close(); }
});
test('trocar idioma mantém sessão, respostas, progresso e resultado oficial; links preservam idioma', async ({ page, context }) => {
  const errors = []; page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/pt-br/?source=switch');
  await page.locator('[data-start]').last().click();
  await expect(page.locator('#question-number')).toHaveText('01');
  await page.getByRole('radio').nth(4).check();
  await expect(page.locator('#next-question')).toBeEnabled();
  await page.locator('#next-question').click();
  await expect(page.locator('#question-number')).toHaveText('02');
  await page.getByRole('radio').nth(1).check();
  await expect(page.locator('#next-question')).toBeEnabled();
  const snapshot = await page.evaluate(()=>JSON.parse(sessionStorage.getItem('prisma.quiz.v1')));
  await page.evaluate(()=>window.i18nReviewMarker=123);
  for (const code of ['en','es','zh-CN','pt-BR']) {
    await selectLanguage(page,code);
    await expect(page.locator('#quiz')).toBeVisible();
    await expect(page.locator('#question-title')).toHaveText(resources[code].quiz.questions['2']);
    await expect(page.getByRole('radio').nth(1)).toBeChecked();
    expect(await page.locator('#quiz-progress').getAttribute('value')).toBe('2');
    expect(await page.evaluate(()=>window.i18nReviewMarker)).toBe(123);
    expect(new URL(page.url()).search).toBe('?source=switch');
    const local = await page.evaluate(()=>JSON.parse(sessionStorage.getItem('prisma.quiz.v1')));
    expect(local.uuid).toBe(snapshot.uuid); expect(local.answers).toEqual(snapshot.answers);
  }
  await selectLanguage(page,'en');
  await page.reload();
  await expect(page.locator('#question-number')).toHaveText('02');
  await expect(page.getByRole('radio').nth(1)).toBeChecked();
  await page.locator('#next-question').click();
  for (let i=3;i<=40;i++) {
    await expect(page.locator('#question-number')).toHaveText(String(i).padStart(2,'0'));
    await page.getByRole('radio').nth(2).check();
    await expect(page.locator('#next-question')).toBeEnabled();
    await page.locator('#next-question').click();
  }
  await expect(page).toHaveURL(new RegExp(`/en/resultado/${snapshot.uuid}$`));
  const answers = Object.fromEntries(Array.from({length:40},(_,i)=>[i+1,i===0?5:i===1?2:3]));
  const expected = calculateResult(answers);
  const stored = await db.quizSession.findUnique({where:{uuid:snapshot.uuid}});
  expect(stored.economicScore).toBe(expected.economicScore); expect(stored.authorityScore).toBe(expected.authorityScore);
  expect(stored.politicalLabel).toBe(expected.politicalLabel);
  let resultRequests=0; page.on('request',request=>{if(request.url().includes(`/api/results/${snapshot.uuid}`))resultRequests++;});
  for (const locale of locales) {
    await selectLanguage(page,locale.code);
    await expect(page.locator('#political-label')).toHaveText(resources[locale.code].results.political.center);
    const url=`http://localhost:3001/${locale.prefix}/resultado/${snapshot.uuid}`;
    await expect(page.locator('#result-url')).toHaveValue(url);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content',url);
    const svg = await page.request.get(`${url}/card.svg`);
    expect((await svg.text())).toContain(resources[locale.code].ui.text104);
  }
  expect(resultRequests).toBe(0);
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.locator('[data-share="copy"]').click();
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain('/zh-cn/resultado/');
  await expect.poll(async()=> (await db.quizSession.findUnique({where:{uuid:snapshot.uuid}})).shared).toBe(true);
  expect(errors).toEqual([]);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'../test-results/i18n-result-zh-mobile.png',fullPage:true});
});
test('resposta pendente e erro são preservados e traduzidos ao trocar idioma', async ({ page }) => {
  await page.goto('/en/quiz');
  await expect(page.locator('#question-number')).toHaveText('01');
  await page.route('**/api/quiz/*/progress',route=>route.abort('failed'));
  await page.getByRole('radio').nth(4).check();
  await expect(page.locator('#quiz-error')).toBeVisible();
  await selectLanguage(page,'es');
  await expect(page.locator('#quiz-error')).toHaveText(resources.es.messages.connection);
  await expect(page.locator('#next-question')).toBeDisabled();
  await expect(page.getByRole('radio').nth(4)).toBeChecked();
  await page.unroute('**/api/quiz/*/progress');
  await page.locator('#retry-save').click();
  await expect(page.locator('#next-question')).toBeEnabled();
});
test('editorial preserva rota, query, histórico e foco sem recarregar', async ({ page }) => {
  await page.goto('/en/metodologia?source=editorial#main');
  await page.evaluate(()=>window.i18nReviewMarker=456);
  await selectLanguage(page,'es');
  await expect(page).toHaveURL('http://localhost:3001/es/metodologia?source=editorial#main');
  await expect(page.locator('h1')).toHaveText('Cómo calcula el quiz tu resultado');
  expect(await page.evaluate(()=>window.i18nReviewMarker)).toBe(456);
  await expect(page.locator('.language-selector summary')).toBeFocused();
  await page.goBack();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('h1')).toHaveText('How your quiz result is calculated');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
});
test('admin traduz login, filtros, paginação, distribuições e datas sem perder estado', async ({ page }) => {
  const answer = Object.fromEntries(Array.from({length:40},(_,i)=>[i+1,3]));
  await db.quizSession.createMany({data:Array.from({length:30},()=>({uuid:randomUUID(),editTokenHash:'a'.repeat(64),quizVersion:'v1',status:'COMPLETED',answers:answer,currentQuestion:40,...calculateResult(answer),completedAt:new Date()}))});
  await page.goto('/zh-cn/admin/login');
  await page.locator('#admin-password').fill('wrong-password');
  await page.locator('#login-button').click();
  await expect(page.locator('#login-error')).toHaveText(resources['zh-CN'].messages.passwordWrong);
  await selectLanguage(page,'en');
  await expect(page.locator('#login-error')).toHaveText(resources.en.messages.passwordWrong);
  await expect(page.locator('#admin-password')).toHaveValue('wrong-password');
  await page.locator('#admin-password').fill('browser-test-password');
  await page.locator('#login-button').click();
  await expect(page).toHaveURL(/\/en\/admin$/);
  await expect(page.locator('#metric-completed')).not.toHaveText('—');
  await page.locator('select[name="status"]').selectOption('COMPLETED');
  await page.locator('#next-page').click();
  await expect(page.locator('#page-label')).toHaveText('Page 2 of 2');
  let requests=0; page.on('request',request=>{if(request.url().includes('/api/admin/'))requests++;});
  await selectLanguage(page,'zh-CN');
  await expect(page.locator('select[name="status"]')).toHaveValue('COMPLETED');
  await expect(page.locator('#page-label')).toHaveText('第2页，共2页');
  await expect(page.locator('#political-chart')).toContainText('中间立场');
  await expect(page.locator('#economic-chart')).toContainText('极左');
  expect(requests).toBe(0);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'../test-results/i18n-admin-zh-mobile.png',fullPage:true});
});
