import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
test.beforeAll(async () => { await db.quizSession.deleteMany(); await db.adminSession.deleteMany(); });
test.afterAll(async () => { await db.quizSession.deleteMany(); await db.adminSession.deleteMany(); await db.$disconnect(); });

test('quiz completo, retomada, resultado público, compartilhamento e dashboard real', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Descubra seu lado político.' })).toBeVisible();
  await page.screenshot({ path: '../test-results/landing-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Descobrir meu lado político' }).click();
  await expect(page.locator('#question-kicker')).toHaveText('PERGUNTA 01');
  await page.locator('.answer-option').nth(2).click();
  await expect(page.locator('#next-question')).toBeEnabled();
  await page.locator('#next-question').click();
  await expect(page.locator('#question-kicker')).toHaveText('PERGUNTA 02');
  await page.reload();
  await page.locator('[data-start]').last().click();
  await expect(page.locator('#question-kicker')).toHaveText('PERGUNTA 02');
  await page.locator('#previous-question').click();
  await page.locator('.answer-option').nth(4).click();
  await expect(page.locator('#next-question')).toBeEnabled();
  await page.locator('#next-question').click();
  for (let i = 2; i <= 40; i++) {
    await expect(page.locator('#question-kicker')).toHaveText(`PERGUNTA ${String(i).padStart(2, '0')}`);
    await page.locator('.answer-option').nth(2).click();
    await expect(page.locator('#next-question')).toBeEnabled();
    await page.locator('#next-question').click();
  }
  await expect(page).toHaveURL(/\/resultado\/[a-f0-9-]+$/);
  await expect(page.locator('#political-label')).toHaveText('Centro');
  await expect(page.locator('#economic-score')).toHaveText('-5');
  await expect(page.locator('#authority-score')).toHaveText('0');
  await expect(page.getByRole('heading', { name: 'Visão econômica', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Visão de autoridade', exact: true })).toBeVisible();
  await expect(page.locator('#economic-label')).toHaveText('Centro');
  await expect(page.locator('#authority-label')).toHaveText('Centro');
  await expect(page.locator('#economic-reading')).toContainText('-5');
  await expect(page.locator('#map-economic-score')).toHaveText('-5');
  await expect(page.locator('#share-authority-label')).toHaveText('Centro');
  await page.screenshot({ path: '../test-results/result-desktop.png', fullPage: true });
  const resultUrl = page.url();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copiar link', exact: true }).last().click();
  await expect(page.locator('.toast')).toContainText('Link copiado');
  const uuid = resultUrl.split('/').pop();
  await expect.poll(async () => (await db.quizSession.findUnique({ where: { uuid } })).shared).toBe(true);
  await page.reload();
  await expect(page.locator('#political-label')).toHaveText('Centro');
  const resultHtml = await page.request.get(resultUrl);
  expect(await resultHtml.text()).toContain('Meu resultado: Centro');
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.locator('#admin-password').fill('browser-test-password');
  await page.locator('#login-button').click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator('#metric-completed')).toHaveText('1');
  await expect(page.locator('#metric-shared')).toHaveText('1');
  await expect(page.locator('#rate-share')).toHaveText('100,00%');
  await expect(page.locator('#scatter-count')).toContainText('1 de 1 pontos');
  await page.screenshot({ path: '../test-results/admin-desktop.png', fullPage: true });
  await page.locator('select[name="shared"]').selectOption('no');
  await expect(page.locator('#metric-completed')).toHaveText('0');
  await expect(page.locator('#results-table')).toContainText('Nenhuma sessão');
  await page.locator('#reset-filters').click();
  await expect(page.locator('#metric-completed')).toHaveText('1');
  await page.locator('#logout').click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect(errors).toEqual([]);
});

test('mobile sem overflow, quiz acessível e resultado responsivo', async ({ page }) => {
  const started = await page.request.post('/api/quiz/start');
  const mobileSession = await started.json();
  await page.request.post(`/api/quiz/${mobileSession.uuid}/complete`, { headers: { 'X-Quiz-Token': mobileSession.token }, data: { answers: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [i + 1, 3])) } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../test-results/landing-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Descobrir meu lado político' }).click();
  await expect(page.locator('#question-title')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.answer-option').nth(3).click();
  await expect(page.locator('#next-question')).toBeEnabled();
  await page.screenshot({ path: '../test-results/quiz-mobile.png', fullPage: true });
  await page.goto(`/resultado/${mobileSession.uuid}`);
  await expect(page.locator('#political-label')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Visão econômica', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Visão de autoridade', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../test-results/result-mobile.png', fullPage: true });
  await page.goto('/admin/login');
  await page.locator('#admin-password').fill('browser-test-password');
  await page.locator('#login-button').click();
  await expect(page.locator('#metric-completed')).not.toHaveText('—');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../test-results/admin-mobile.png', fullPage: true });
});

test('falha ao salvar mantém resposta e permite reenviar sem avançar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Descobrir meu lado político' }).click();
  await expect(page.locator('#question-kicker')).toHaveText('PERGUNTA 01');
  await page.route('**/api/quiz/*/progress', route => route.abort('failed'));
  await page.locator('.answer-option').nth(2).click();
  await expect(page.locator('#quiz-error')).toBeVisible();
  await expect(page.locator('#next-question')).toBeDisabled();
  await expect(page.getByRole('radio').nth(2)).toBeChecked();
  await page.unroute('**/api/quiz/*/progress');
  await page.locator('#retry-save').click();
  await expect(page.locator('#next-question')).toBeEnabled();
  await page.locator('#next-question').click();
  await expect(page.locator('#question-kicker')).toHaveText('PERGUNTA 02');
  await page.getByRole('link', { name: 'Metodologia', exact: true }).click();
  await expect(page.locator('#landing')).toBeVisible();
  await page.locator('[data-start]').last().click();
  await expect(page.locator('#question-kicker')).toHaveText('PERGUNTA 02');
});

test('duas URLs reais preservam links e permitem quiz, compartilhamento e administração', async ({ page, context }) => {
  for (const origin of ['http://localhost:3001', 'http://127.0.0.1:3001']) {
    await page.goto(origin);
    const startedResponse = page.waitForResponse(response => response.url() === `${origin}/api/quiz/start` && response.status() === 201);
    await page.getByRole('button', { name: 'Descobrir meu lado político' }).click();
    const { uuid, token } = await (await startedResponse).json();
    await expect(page.locator('#question-kicker')).toHaveText('PERGUNTA 01');
    await page.locator('.answer-option').nth(2).click();
    await expect(page.locator('#next-question')).toBeEnabled();
    const completed = await page.request.post(`${origin}/api/quiz/${uuid}/complete`, {
      headers: { Origin: origin, 'X-Quiz-Token': token },
      data: { answers: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [i + 1, 3])) }
    });
    expect(completed.ok()).toBe(true);
    const url = `${origin}/resultado/${uuid}`;
    expect((await completed.json()).resultUrl).toBe(url);
    await page.goto(url);
    await expect(page.locator('#result-url')).toHaveValue(url);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', url);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', url);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await page.getByRole('button', { name: 'Copiar link', exact: true }).last().click();
    await expect(page.locator('.toast')).toContainText('Link copiado');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
    await expect.poll(async () => (await db.quizSession.findUnique({ where: { uuid } })).shared).toBe(true);
    await page.goto(`${origin}/admin`);
    await expect(page).toHaveURL(`${origin}/admin/login`);
    await page.locator('#admin-password').fill('browser-test-password');
    await page.locator('#login-button').click();
    await expect(page).toHaveURL(`${origin}/admin`);
    await expect(page.locator('#metric-completed')).not.toHaveText('—');
    await page.locator('#logout').click();
    await expect(page).toHaveURL(`${origin}/admin/login`);
  }
});

test('conteúdo editorial é legível sem JavaScript e cabe no celular', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto('http://localhost:3001/');
    await expect(page.getByRole('heading', { name: 'Descubra seu lado político.' })).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    await page.getByText('Como descobrir meu lado político com este quiz?', { exact: true }).click();
    await expect(page.locator('.faq-item').first().locator('p')).toBeVisible();
    await page.getByRole('link', { name: 'metodologia do teste', exact: true }).click();
    await expect(page).toHaveURL(/\/metodologia$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Como o quiz calcula seu resultado');
    await expect(page.locator('.method-table')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: '../test-results/methodology-mobile.png', fullPage: true });
    for (const path of ['/sobre', '/privacidade', '/perguntas-frequentes']) {
      await page.goto(`http://localhost:3001${path}`);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  } finally {
    await context.close();
  }
});
