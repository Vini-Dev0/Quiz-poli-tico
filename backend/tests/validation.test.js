import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validateAnswers, validateProgress, validateUuid, integerQuery } from '../src/utils/validation.js';
test('UUIDs incrementais, malformados e versões erradas são recusados', () => {
  assert.equal(validateUuid(randomUUID()).length, 36);
  for (const value of ['1', '550e8400-e29b-11d4-a716-446655440000', '../admin', '']) assert.throws(() => validateUuid(value));
});
test('respostas fora da escala, IDs extras, lacunas e valores não inteiros são recusados', () => {
  for (const value of [null, [], { 1: 0 }, { 1: 6 }, { 1: 1.5 }, { 1: '5' }, { 41: 3 }, { '01': 3 }, { 2: 3 }]) assert.throws(() => validateAnswers(value));
  assert.deepEqual(validateAnswers({ 1: 5, 2: 2 }), { 1: 5, 2: 2 });
  assert.throws(() => validateAnswers({ 1: 3 }, true));
});
test('validação de progresso e paginação impede saltos e consumo excessivo', () => {
  assert.throws(() => validateProgress({ currentQuestion: 17, answers: { 1: 3 } }));
  assert.deepEqual(validateProgress({ currentQuestion: 2, answers: { 1: 3 } }), { currentQuestion: 2, answers: { 1: 3 } });
  for (const value of ['0', '-1', '2.5', '101', ['1']]) assert.throws(() => integerQuery(value, 25, 100));
  assert.equal(integerQuery(undefined, 25, 100), 25);
});
