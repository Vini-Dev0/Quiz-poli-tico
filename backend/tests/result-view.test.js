import test from 'node:test';
import assert from 'node:assert/strict';
import { presentResult } from '../src/utils/result-view.js';

const stored = Object.freeze({
  uuid: '550e8400-e29b-41d4-a716-446655440000',
  economicScore: 67,
  authorityScore: -72,
  economicLabel: 'Direita',
  authorityLabel: 'Libertário radical',
  politicalLabel: 'Direita Libertária',
  completedAt: new Date('2026-10-04T12:00:00Z')
});
test('as duas visões usam exatamente os valores e classificações salvos', () => {
  const result = presentResult(stored);
  assert.deepEqual(result.economicView, { score: stored.economicScore, label: stored.economicLabel });
  assert.deepEqual(result.authorityView, { score: stored.authorityScore, label: stored.authorityLabel });
  for (const [key, value] of Object.entries(stored)) assert.equal(result[key], value);
});
test('projeção pública não expõe respostas, ID interno ou segredo de edição', () => {
  const result = presentResult({ ...stored, answers: { 1: 5 }, id: 17, editTokenHash: 'private-token-hash', shared: true });
  for (const field of ['answers', 'id', 'editTokenHash', 'shared']) assert.equal(Object.hasOwn(result, field), false);
  assert.deepEqual(Object.keys(result.economicView).sort(), ['label', 'score']);
  assert.deepEqual(Object.keys(result.authorityView).sort(), ['label', 'score']);
});
test('zero e valores decimais não são arredondados ou reclassificados na apresentação', () => {
  const saved = { ...stored, economicScore: 0, authorityScore: -12.35, economicLabel: 'Centro', authorityLabel: 'Liberal' };
  const result = presentResult(saved);
  assert.equal(result.economicView.score, 0);
  assert.equal(result.authorityView.score, -12.35);
  assert.equal(result.authorityView.label, saved.authorityLabel);
});
