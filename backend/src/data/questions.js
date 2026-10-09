import { readFileSync } from 'node:fs';
// Catálogo v1: 40 afirmações propostas para este projeto, sem validação
// psicométrica. Traduções ficam em frontend/locales/*/quiz.json.
// IDs, direções e pesos são independentes do idioma e permanecem imutáveis.
export const QUIZ_VERSION = 'v1';
const pt = JSON.parse(readFileSync(new URL('../../../frontend/locales/pt-BR/quiz.json', import.meta.url),'utf8'));
const economic = [-1,1,-1,1,-1,1,-1,1,-1,1,-1,1,-1,1,-1,1,-1,1,-1,1];
const authority = [-1,1,-1,1,-1,1,-1,1,-1,1,-1,1,-1,1,-1,1,-1,1,-1,1];
// Concordância com +1 aumenta o respectivo eixo. Os eixos têm 20 itens
// cada, sem contribuições cruzadas. Não alterar regras ao traduzir textos.
export const questions = Object.freeze([
  ...economic.map((direction, i) => Object.freeze({ id: i + 1, text: pt.questions[i + 1], topic: pt.topicEconomic, axes: { economic: direction, authority: 0 }, weight: 1 })),
  ...authority.map((direction, i) => Object.freeze({ id: i + 21, text: pt.questions[i + 21], topic: pt.topicAuthority, axes: { economic: 0, authority: direction }, weight: 1 }))
]);
