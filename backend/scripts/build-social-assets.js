import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Rasteriza os vetores locais, sem fontes, imagens ou serviços externos.
// Os PNGs ficam versionados; o deploy não depende de Chrome ou Playwright.
const assets = new URL('../../frontend/assets/', import.meta.url);
const { locales } = await import('../../frontend/js/i18n-config.js');
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
  for (const locale of locales) {
    const ui = JSON.parse(await readFile(new URL(`../../frontend/locales/${locale.code}/ui.json`, import.meta.url), 'utf8'));
    const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
    let svg = await readFile(new URL('social-card.svg', assets), 'utf8');
    const entries = [['QUIZ POLÍTICO EM DOIS EIXOS',ui.text009], ['Descubra seu',ui.text010], ['lado político.',ui.text011], ['40 perguntas · gratuito · sem cadastro',`${ui.text147}`], ['AUTORIDADE',ui.text114], ['ECONOMIA',ui.text103], ['MAPA ILUSTRATIVO',ui.text029]];
    for (const [before, after] of entries) svg = svg.replace(`>${before}<`, `>${escape(after)}<`);
    svg = svg.replace('font-size="66"','font-size="49"').replace('font-size="71"','font-size="56"');
    // O subtítulo longo não pode encobrir o gráfico: usar textLength limita
    // somente o texto desta linha, preservando a tipografia dos títulos.
    svg = svg.replace('<text x="79" y="430"', '<text textLength="580" lengthAdjust="spacingAndGlyphs" x="79" y="430"');
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.setContent(`<html lang="${locale.code}"><head><style>html,body{margin:0}svg{display:block;width:1200px;height:630px}</style></head><body>${svg}</body></html>`);
    await page.screenshot({ path: fileURLToPath(new URL(`social-card-${locale.prefix}.png`,assets)) });
  }
  console.log('Previews localizados em português, inglês, espanhol e chinês gerados.');
} finally {
  await browser.close();
}
