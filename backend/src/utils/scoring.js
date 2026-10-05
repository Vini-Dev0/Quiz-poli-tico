import { questions } from '../data/questions.js';

export const ECONOMIC_LABELS = ['Extrema esquerda', 'Esquerda', 'Centro-esquerda', 'Centro', 'Centro-direita', 'Direita', 'Direita radical'];
export const AUTHORITY_LABELS = ['Libertário radical', 'Libertário', 'Liberal', 'Centro', 'Autoritário moderado', 'Autoritário', 'Autoritário forte'];

// Resposta 1..5 -> -2..2. Soma ponderada por eixo, dividida pela
// maior soma absoluta possível (2 * soma(|direção| * peso)).
// O outro eixo nunca participa do denominador ou do numerador.
export function normalizeScore(sum, maxMagnitude) {
  if (maxMagnitude === 0) return 0;
  return Math.round(Math.max(-100, Math.min(100, sum / maxMagnitude * 100)) * 100) / 100;
}
function calculateAxis(answers, axis) {
  let sum = 0;
  let max = 0;
  for (const question of questions) {
    const answer = answers[String(question.id)];
    if (!Number.isInteger(answer) || answer < 1 || answer > 5) throw new TypeError('São necessárias 40 respostas válidas.');
    sum += (answer - 3) * question.axes[axis] * question.weight;
    max += 2 * Math.abs(question.axes[axis]) * question.weight;
  }
  return normalizeScore(sum, max);
}
export const calculateEconomicScore = answers => calculateAxis(answers, 'economic');
export const calculateAuthorityScore = answers => calculateAxis(answers, 'authority');
// Faixas sem lacunas: [-100,-70), [-70,-40), [-40,-10),
// [-10,10], (10,40], (40,70], (70,100].
export function labelIndex(score) {
  if (score < -70) return 0;
  if (score < -40) return 1;
  if (score < -10) return 2;
  if (score <= 10) return 3;
  if (score <= 40) return 4;
  if (score <= 70) return 5;
  return 6;
}
export const getEconomicLabel = score => ECONOMIC_LABELS[labelIndex(score)];
export const getAuthorityLabel = score => AUTHORITY_LABELS[labelIndex(score)];
export function getPoliticalLabel(economic, authority) {
  const centerEconomy = Math.abs(economic) <= 10;
  const centerAuthority = Math.abs(authority) <= 10;
  if (centerEconomy && centerAuthority) return 'Centro';
  const side = centerEconomy ? 'Centro' : economic < 0 ? 'Esquerda' : 'Direita';
  if (centerAuthority) return side;
  return `${side} ${authority < 0 ? 'Libertária' : 'Autoritária'}`;
}
export function calculateResult(answers) {
  const economicScore = calculateEconomicScore(answers);
  const authorityScore = calculateAuthorityScore(answers);
  return { economicScore, authorityScore, economicLabel: getEconomicLabel(economicScore), authorityLabel: getAuthorityLabel(authorityScore), politicalLabel: getPoliticalLabel(economicScore, authorityScore) };
}
