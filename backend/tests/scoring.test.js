import test from 'node:test';
import assert from 'node:assert/strict';
import { questions } from '../src/data/questions.js';
import { calculateEconomicScore, calculateAuthorityScore, calculateResult, getEconomicLabel, getAuthorityLabel, getPoliticalLabel, normalizeScore } from '../src/utils/scoring.js';
const neutral = () => Object.fromEntries(questions.map(q => [q.id, 3]));
test('catálogo possui exatamente 40 IDs únicos e eixos balanceados', () => {
  assert.equal(questions.length, 40);
  assert.equal(new Set(questions.map(q => q.id)).size, 40);
  for (const axis of ['economic', 'authority']) {
    assert.equal(questions.filter(q => q.axes[axis] !== 0).length, 20);
    assert.equal(questions.reduce((sum, q) => sum + q.axes[axis], 0), 0);
  }
});
test('neutralidade produz centro nos dois eixos', () => {
  assert.deepEqual(calculateResult(neutral()), { economicScore: 0, authorityScore: 0, economicLabel: 'Centro', authorityLabel: 'Centro', politicalLabel: 'Centro' });
});
test('quatro quadrantes alcançam extremos independentes', () => {
  for (const economic of [-100, 100]) for (const authority of [-100, 100]) {
    const answers = Object.fromEntries(questions.map(q => [q.id, 3 + 2 * Math.sign(q.axes.economic ? economic * q.axes.economic : authority * q.axes.authority)]));
    assert.equal(calculateEconomicScore(answers), economic);
    assert.equal(calculateAuthorityScore(answers), authority);
    assert.equal(getPoliticalLabel(economic, authority), `${economic < 0 ? 'Esquerda' : 'Direita'} ${authority < 0 ? 'Libertária' : 'Autoritária'}`);
  }
});
test('uma resposta econômica não altera autoridade e vice-versa', () => {
  const answers = neutral(); answers[1] = 5;
  assert.equal(calculateEconomicScore(answers), -5);
  assert.equal(calculateAuthorityScore(answers), 0);
  answers[21] = 5;
  assert.equal(calculateEconomicScore(answers), -5);
  assert.equal(calculateAuthorityScore(answers), -5);
});
test('limiares e normalização são determinísticos', () => {
  assert.equal(getEconomicLabel(-70), 'Esquerda');
  assert.equal(getEconomicLabel(-40), 'Centro-esquerda');
  assert.equal(getEconomicLabel(-10), 'Centro');
  assert.equal(getEconomicLabel(10), 'Centro');
  assert.equal(getEconomicLabel(40), 'Centro-direita');
  assert.equal(getAuthorityLabel(70), 'Autoritário');
  assert.equal(getAuthorityLabel(70.01), 'Autoritário forte');
  assert.equal(normalizeScore(1000, 40), 100);
  assert.equal(normalizeScore(0, 0), 0);
  assert.throws(() => calculateResult({}), TypeError);
});
