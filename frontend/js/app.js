import { api, setText } from './common.js';
const STORAGE = 'prisma.quiz.v1';
let session = null;
let questions = [];
let index = 0;
let busy = false;
let saved = true;
try { session = JSON.parse(sessionStorage.getItem(STORAGE) || 'null'); } catch { session = null; }
const inputs = [...document.querySelectorAll('input[name="answer"]')];
const startButtons = [...document.querySelectorAll('[data-start]')];
const globalError = document.getElementById('global-error');
if (session?.uuid && session?.token) {
  document.getElementById('resume-note').hidden = false;
  startButtons.forEach(button => { button.firstChild.textContent = 'Continuar meu quiz '; });
}
function persist() {
  try { sessionStorage.setItem(STORAGE, JSON.stringify(session)); } catch { /* Memória da aba continua válida se o navegador bloquear o armazenamento. */ }
}
function setBusy(value) {
  busy = value;
  inputs.forEach(input => { input.disabled = value; });
  document.getElementById('previous-question').disabled = value || index === 0;
  document.getElementById('next-question').disabled = value || !session?.answers?.[questions[index]?.id] || !saved;
}
function render(focus = true) {
  const question = questions[index];
  session.currentQuestion = index + 1;
  setText('question-title', question.text);
  setText('quiz-topic', question.topic);
  setText('question-number', String(index + 1).padStart(2, '0'));
  setText('question-kicker', `PERGUNTA ${String(index + 1).padStart(2, '0')}`);
  document.getElementById('quiz-progress').value = Object.keys(session.answers).length;
  inputs.forEach(input => { input.checked = Number(input.value) === session.answers[question.id]; });
  setText('next-question', index === 39 ? 'Ver meu resultado ↗' : 'Próxima pergunta →');
  setText('save-status', session.answers[question.id] ? 'Resposta salva' : 'Selecione uma resposta');
  document.getElementById('quiz-error').hidden = true;
  document.getElementById('retry-save').hidden = true;
  setBusy(false);
  if (focus) document.getElementById('question-title').focus({ preventScroll: true });
}
async function start() {
  startButtons.forEach(button => { button.disabled = true; });
  globalError.hidden = true;
  try {
    const catalogue = await api('/quiz/questions');
    questions = catalogue.questions;
    if (session?.uuid && session?.token) {
      try {
        const remote = await api(`/quiz/${session.uuid}`, { token: session.token });
        if (remote.status === 'COMPLETED') { location.assign(`/resultado/${session.uuid}`); return; }
        // Em caso de falha de rede anterior, preservar o snapshot local e reenviá-lo.
        const localPending = session.pending && session.quizVersion === catalogue.version;
        session = { ...session, ...remote, ...(localPending ? { answers: session.answers, currentQuestion: session.currentQuestion, pending: true } : { pending: false }) };
      } catch (error) {
        if ([403, 404, 409].includes(error.status)) { session = null; sessionStorage.removeItem(STORAGE); }
        else throw error;
      }
    }
    if (!session) session = { ...await api('/quiz/start', { method: 'POST' }), answers: {}, pending: false };
    index = Math.min(39, Math.max(0, session.currentQuestion - 1));
    persist();
    document.getElementById('landing').hidden = true;
    document.getElementById('quiz').hidden = false;
    startButtons.forEach(button => { button.hidden = true; });
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (session.pending) await saveAnswer();
  } catch (error) { globalError.textContent = error.message; globalError.hidden = false; }
  finally { startButtons.forEach(button => { button.disabled = false; }); }
}
async function saveAnswer() {
  setBusy(true);
  saved = false;
  session.pending = true;
  persist();
  setText('save-status', 'Salvando resposta…');
  document.getElementById('quiz-error').hidden = true;
  document.getElementById('retry-save').hidden = true;
  try {
    await api(`/quiz/${session.uuid}/progress`, { method: 'PATCH', token: session.token, body: JSON.stringify({ currentQuestion: index + 1, answers: session.answers }) });
    saved = true;
    session.pending = false;
    persist();
    setText('save-status', '✓ Resposta salva');
  } catch (error) {
    const element = document.getElementById('quiz-error');
    element.textContent = error.message;
    element.hidden = false;
    document.getElementById('retry-save').hidden = false;
    setText('save-status', 'Resposta aguardando envio');
  } finally { setBusy(false); }
}
startButtons.forEach(button => button.addEventListener('click', start));
document.querySelectorAll('.site-header nav a, .site-footer a[href^="#"]').forEach(link => link.addEventListener('click', () => {
  if (document.getElementById('quiz').hidden) return;
  document.getElementById('quiz').hidden = true;
  document.getElementById('landing').hidden = false;
  document.getElementById('resume-note').hidden = false;
  startButtons.forEach(button => { button.hidden = false; button.firstChild.textContent = 'Continuar meu quiz '; });
}));
inputs.forEach(input => input.addEventListener('change', async () => {
  if (busy) return;
  session.answers[questions[index].id] = Number(input.value);
  document.getElementById('quiz-progress').value = Object.keys(session.answers).length;
  await saveAnswer();
}));
document.getElementById('retry-save').addEventListener('click', saveAnswer);
async function navigateQuestion(nextIndex) {
  setBusy(true);
  try {
    await api(`/quiz/${session.uuid}/progress`, { method: 'PATCH', token: session.token, body: JSON.stringify({ currentQuestion: nextIndex + 1, answers: session.answers }) });
    index = nextIndex;
    render();
    persist();
  } catch (error) {
    const element = document.getElementById('quiz-error');
    element.textContent = error.message;
    element.hidden = false;
  } finally { setBusy(false); }
}
document.getElementById('previous-question').addEventListener('click', async () => {
  if (busy || index === 0 || !saved) return;
  await navigateQuestion(index - 1);
});
document.getElementById('next-question').addEventListener('click', async () => {
  if (busy || !saved || !session.answers[questions[index].id]) return;
  if (index < 39) { await navigateQuestion(index + 1); return; }
  setBusy(true);
  setText('save-status', 'Calculando sua perspectiva…');
  try {
    await api(`/quiz/${session.uuid}/complete`, { method: 'POST', token: session.token, body: JSON.stringify({ answers: session.answers }) });
    sessionStorage.removeItem(STORAGE);
    location.assign(`/resultado/${session.uuid}`);
  } catch (error) {
    const element = document.getElementById('quiz-error');
    element.textContent = error.message;
    element.hidden = false;
    setText('save-status', 'Tente finalizar novamente');
    setBusy(false);
  }
});
