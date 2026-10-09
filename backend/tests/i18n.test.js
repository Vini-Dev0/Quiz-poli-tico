import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { locales, chooseLocale, matchLocale, localizedPath, lookup } from '../../frontend/js/i18n-config.js';
import { questions } from '../src/data/questions.js';
import { calculateResult } from '../src/utils/scoring.js';
Object.assign(process.env, { DOTENV_CONFIG_PATH: '/nonexistent/i18n.env', APP_URL: 'https://quiz.example.com', SEO_URL: 'https://quiz.example.com', SEO_INDEXING_ENABLED: 'true', DATABASE_URL: 'postgresql://quiz:test@localhost:5432/quiz', ADMIN_PASSWORD: 'i18n-test-password', JWT_SECRET: 'i18n-test-secret-at-least-32-characters' });
const { resources, t, localizeResult, renderTemplate, translateError } = await import('../src/services/i18n.js');
const { getSitePages } = await import('../src/data/site-pages.js');
const { pageMetadata, sitemapXml } = await import('../src/utils/seo.js');
for (const [languages, expected] of [[['pt-BR'],'pt-BR'],[['pt-PT'],'pt-BR'],[['en-US','pt'],'en'],[['en-GB'],'en'],[['es-MX'],'es'],[['es-ES'],'es'],[['zh-CN'],'zh-CN'],[['zh-SG'],'zh-CN'],[['zh-Hans'],'zh-CN'],[['zh-TW'],'pt-BR'],[['zh-HK','en'],'en'],[['de-DE'],'pt-BR']]) {
  test(`detecção ${languages.join(',')} → ${expected}`, () => assert.equal(chooseLocale({ languages }),expected));
}
test('preferência manual tem precedência sobre navegador e URL sobre ambas', () => {
  assert.equal(chooseLocale({ saved:'es',languages:['en'] }),'es');
  assert.equal(chooseLocale({ pathname:'/zh-cn/quiz',saved:'es',languages:['en'] }),'zh-CN');
  assert.equal(chooseLocale({ saved:'invalid',languages:['en'] }),'en');
  assert.equal(matchLocale('zh-TW'),null);
});
test('rotas equivalentes preservam query/hash e nunca duplicam prefixos', () => {
  assert.equal(localizedPath('/pt-br/quiz?source=test#answers','en'),'/en/quiz?source=test#answers');
  assert.equal(localizedPath('/en/quiz?source=test#answers','en'),'/en/quiz?source=test#answers');
  assert.equal(localizedPath('/resultado/abc','es'),'/es/resultado/abc');
});
function leaves(value, prefix = '') {
  return Object.fromEntries(Object.entries(value).flatMap(([key,item]) => typeof item === 'object' ? Object.entries(leaves(item,`${prefix}${key}.`)) : [[`${prefix}${key}`,item]]));
}
const placeholders = value => [...String(value).matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
for (const locale of locales) {
  test(`recursos ${locale.code}: completos, UTF-8, 40 perguntas e interpolações íntegras`, () => {
    const base = leaves(resources['pt-BR']);
    const target = leaves(resources[locale.code]);
    assert.deepEqual(Object.keys(target).sort(),Object.keys(base).sort());
    for (const [key,value] of Object.entries(target)) {
      assert.ok(typeof value === 'string' && value.trim(),key);
      assert.doesNotMatch(value,/\uFFFD|<script|<iframe/);
      assert.deepEqual(placeholders(value),placeholders(base[key]),key);
    }
    assert.equal(Object.keys(resources[locale.code].quiz.questions).length,40);
    assert.match(resources[locale.code].results.shareText, /\n/);
    assert.doesNotMatch(resources[locale.code].results.shareText, /\\n/);
    if (locale.code === 'zh-CN') assert.match(resources[locale.code].quiz.questions['1'],/[\u4e00-\u9fff]/);
  });
  test(`mesmas respostas e classificações políticas em ${locale.code}`, () => {
    for (const [economy,authority] of [[1,1],[1,-1],[-1,1],[-1,-1],[0,0]]) {
      const answers = Object.fromEntries(questions.map(q=>[q.id,3+2*(q.axes.economic*economy+q.axes.authority*authority)]));
      const result = calculateResult(answers);
      const display = localizeResult(result,locale.code);
      assert.equal(display.economicScore,result.economicScore);
      assert.equal(display.authorityScore,result.authorityScore);
      assert.deepEqual(display.labelKeys,localizeResult(result,'pt-BR').labelKeys);
      assert.equal(display.politicalLabel,t(locale.code,`results.political.${display.labelKeys.political}`));
    }
  });
  test(`SSR e SEO traduzidos em ${locale.code}`, () => {
    const source = readFileSync(new URL('../../frontend/index.html',import.meta.url),'utf8');
    const html = renderTemplate(source,locale.code,'/', 'test-nonce',{ minutes:30 });
    assert.ok(html.includes(`lang="${locale.code}"`));
    assert.ok(html.includes(t(locale.code,'quiz.answers.1')));
    for (const match of source.matchAll(/data-i18n(?:-(?:aria-label|title|placeholder|alt))?="([^"]+)"/g)) assert.notEqual(t(locale.code,match[1]),match[1]);
    for (const page of getSitePages(locale.code)) {
      const metadata = pageMetadata(page,'test-nonce',locale.code);
      assert.ok(metadata.includes(`<title>${page.title}</title>`));
      assert.ok(metadata.includes(`canonical" href="https://quiz.example.com${localizedPath(page.path,locale.code)}"`));
      for (const other of locales) assert.ok(metadata.includes(`hreflang="${other.hreflang}" href="https://quiz.example.com${localizedPath(page.path,other.code)}"`));
      assert.ok(metadata.includes('hreflang="x-default"'));
      assert.ok(metadata.includes(`"inLanguage":"${locale.code}"`));
    }
  });
}
test('fallback, interpolação segura e erros da API são localizados', () => {
  assert.equal(lookup({ messages:{} },'messages.language',{},resources['pt-BR']),'Idioma');
  assert.equal(t('en','messages.languageChanged',{language:'<script>'}),'Language changed to <script>.');
  assert.deepEqual(translateError('Senha incorreta.','en'),{code:'passwordWrong',message:'Incorrect password.'});
  const invalidFilter = translateError('Filtro economic inválido.', 'en');
  assert.deepEqual(invalidFilter.params, { name: 'economic' });
  assert.equal(invalidFilter.message, t('en', 'messages.filterInvalid', invalidFilter.params));
  assert.doesNotMatch(invalidFilter.message, /\{\w+\}/);
  const inline = renderTemplate('<html lang="pt-BR"><body><span data-i18n="messages.language"> Idioma </span><a>link</a></body></html>', 'en', '/', 'test');
  assert.ok(inline.includes('> Language </span><a>'));
});
test('sitemap lista 20 versões canônicas com reciprocidade e zh-Hans', () => {
  const xml = sitemapXml();
  assert.equal((xml.match(/<loc>/g)||[]).length,20);
  assert.equal((xml.match(/<xhtml:link/g)||[]).length,100);
  assert.match(xml,/xmlns:xhtml="http:\/\/www.w3.org\/1999\/xhtml"/);
  assert.match(xml,/hreflang="zh-Hans"/);
  assert.doesNotMatch(xml,/resultado|admin|\/quiz</);
});
