import { HttpError } from './errors.js';
export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateUuid(uuid) {
  if (!UUID_V4.test(uuid)) throw new HttpError(400, 'UUID inválido.');
  return uuid.toLowerCase();
}
export function validateAnswers(answers, complete = false) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new HttpError(400, 'Envie as respostas como objeto.');
  const keys = Object.keys(answers);
  if (keys.length > 40 || (complete && keys.length !== 40)) throw new HttpError(400, 'A conclusão exige exatamente 40 respostas.');
  const clean = {};
  for (const key of keys) {
    if (!/^(?:[1-9]|[1-3][0-9]|40)$/.test(key) || !Number.isInteger(answers[key]) || answers[key] < 1 || answers[key] > 5) throw new HttpError(400, 'Perguntas devem ser de 1 a 40 e respostas inteiras de 1 a 5.');
    clean[key] = answers[key];
  }
  for (let i = 1; i <= keys.length; i++) if (!(String(i) in clean)) throw new HttpError(400, 'Responda às perguntas em sequência.');
  return clean;
}
export function validateProgress(body) {
  const answers = validateAnswers(body?.answers);
  const currentQuestion = body?.currentQuestion;
  if (!Number.isInteger(currentQuestion) || currentQuestion < 1 || currentQuestion > 40 || currentQuestion > Object.keys(answers).length + 1) throw new HttpError(400, 'Pergunta atual inválida.');
  return { answers, currentQuestion };
}
export function integerQuery(value, fallback, max) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw new HttpError(400, 'Paginação inválida.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > max) throw new HttpError(400, 'Paginação fora do limite.');
  return number;
}
