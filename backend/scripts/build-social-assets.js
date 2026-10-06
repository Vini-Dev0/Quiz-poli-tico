import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Rasteriza os vetores locais, sem fontes, imagens ou serviços externos.
// Os PNGs ficam versionados; o deploy não depende de Chrome ou Playwright.
const assets = new URL('../../frontend/assets/', import.meta.url);
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROME === '1' ? { channel: 'chrome' } : {}) });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [source, target, size] of [
    ['social-card.svg', 'social-card.png', { width: 1200, height: 630 }],
    ['mark.svg', 'favicon.png', { width: 64, height: 64 }],
    ['mark.svg', 'apple-touch-icon.png', { width: 180, height: 180 }]
  ]) {
    await page.setViewportSize(size);
    const svg = await readFile(new URL(source, assets), 'utf8');
    await page.setContent(`<html><head><style>html,body{margin:0;width:100%;height:100%;background:#101016}svg{display:block;width:100%;height:100%}</style></head><body>${svg}</body></html>`);
    await page.screenshot({ path: fileURLToPath(new URL(target, assets)) });
  }
  console.log('Card PNG 1200×630 e ícones locais gerados.');
} finally {
  await browser.close();
}
