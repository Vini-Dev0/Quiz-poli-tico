import { api, setError, setText } from './common.js?v=4';
import { t, ready, localPath, safeRead, safeWrite, safeRemove } from './i18n.js?v=4';
import { basePath } from './i18n-config.js?v=4';
await ready;
const STORAGE = 'prisma.quiz.v1';
let session = null;
let questions = [];
let index = 0;
let busy = false;
let saved = true;
try { session = JSON.parse(safeRead('sessionStorage', STORAGE) || 'null'); } catch { session = null; }
const inputs = [...document.querySelectorAll('input[name="answer"]')];
const startButtons = [...document.querySelectorAll('[data-start]')];
const globalError = document.getElementById('global-error');
if (session?.uuid && session?.token) {
  document.getElementById('resume-note').hidden = false;
  startButtons.forEach(button => { button.querySelector('[data-i18n]').textContent = t('quiz.resume'); });
}
function persist() {
  try { safeWrite('sessionStorage', STORAGE, JSON.stringify(session)); } catch { /* Memória da aba continua válida se o navegador bloquear o armazenamento. */ }
}
function setBusy(value) {
  busy = value;
  inputs.forEach(input => { input.disabled = value; });
  document.getElementById('previous-question').disabled = value || index === 0;
  document.getElementById('next-question').disabled = value || !session?.answers?.[questions[index]?.id] || !saved;
}
function render(focus = true, languageOnly = false) {
  const wasBusy = busy;
  const question = questions[index];
  session.currentQuestion = index + 1;
  setText('question-title', t(`quiz.questions.${question.id}`));
  setText('quiz-topic', t(question.id <= 20 ? 'quiz.topicEconomic' : 'quiz.topicAuthority'));
  setText('question-number', String(index + 1).padStart(2, '0'));
  setText('question-kicker', t('quiz.question', { number: String(index + 1).padStart(2, '0') }));
  document.getElementById('quiz-progress').value = Object.keys(session.answers).length;
  inputs.forEach(input => { input.checked = Number(input.value) === session.answers[question.id]; });
  setText('next-question', t(index === 39 ? 'quiz.finish' : 'quiz.next'));
  setText('save-status', t(session.pending ? 'quiz.pending' : session.answers[question.id] ? 'quiz.saved' : 'quiz.select'));
  if (!languageOnly) {
    document.getElementById('quiz-error').hidden = true;
    document.getElementById('retry-save').hidden = true;
  }
  setBusy(languageOnly ? wasBusy : false);
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
        if (remote.status === 'COMPLETED') { location.assign(localPath(`/resultado/${session.uuid}`)); return; }
        // Em caso de falha de rede anterior, preservar o snapshot local e reenviá-lo.
        const localPending = session.pending && session.quizVersion === catalogue.version;
        session = { ...session, ...remote, ...(localPending ? { answers: session.answers, currentQuestion: session.currentQuestion, pending: true } : { pending: false }) };
      } catch (error) {
        if ([403, 404, 409].includes(error.status)) { session = null; safeRemove('sessionStorage', STORAGE); }
        else throw error;
      }
    }
    if (!session) session = { ...await api('/quiz/start', { method: 'POST' }), answers: {}, pending: false };
    index = Math.min(39, Math.max(0, session.currentQuestion - 1));
    persist();
    if (basePath(location.pathname) !== '/quiz') history.pushState({}, '', localPath(`/quiz${location.search}`));
    document.getElementById('landing').hidden = true;
    document.getElementById('quiz').hidden = false;
    startButtons.forEach(button => { button.hidden = true; });
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (session.pending) await saveAnswer();
  } catch (error) { setError('global-error', error); globalError.hidden = false; }
  finally { startButtons.forEach(button => { button.disabled = false; }); }
}
async function saveAnswer() {
  setBusy(true);
  saved = false;
  session.pending = true;
  persist();
  setText('save-status', t('quiz.saving'));
  document.getElementById('quiz-error').hidden = true;
  document.getElementById('retry-save').hidden = true;
  try {
    await api(`/quiz/${session.uuid}/progress`, { method: 'PATCH', token: session.token, body: JSON.stringify({ currentQuestion: index + 1, answers: session.answers }) });
    saved = true;
    session.pending = false;
    persist();
    setText('save-status', '✓ ' + t('quiz.saved'));
  } catch (error) {
    const element = document.getElementById('quiz-error');
    setError('quiz-error', error);
    element.hidden = false;
    document.getElementById('retry-save').hidden = false;
    setText('save-status', t('quiz.pending'));
  } finally { setBusy(false); }
}
startButtons.forEach(button => button.addEventListener('click', start));
document.querySelectorAll('.site-header > nav a, .site-footer a[href^="#"]').forEach(link => link.addEventListener('click', () => {
  if (document.getElementById('quiz').hidden) return;
  document.getElementById('quiz').hidden = true;
  document.getElementById('landing').hidden = false;
  document.getElementById('resume-note').hidden = false;
  startButtons.forEach(button => { button.hidden = false; button.querySelector('[data-i18n]').textContent = t('quiz.resume'); });
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
    setError('quiz-error', error);
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
  setText('save-status', t('quiz.calculating'));
  try {
    await api(`/quiz/${session.uuid}/complete`, { method: 'POST', token: session.token, body: JSON.stringify({ answers: session.answers }) });
    safeRemove('sessionStorage', STORAGE);
    location.assign(localPath(`/resultado/${session.uuid}`));
  } catch (error) {
    const element = document.getElementById('quiz-error');
    setError('quiz-error', error);
    element.hidden = false;
    setText('save-status', t('quiz.retryFinish'));
    setBusy(false);
  }
});
function translateQuiz() {
  inputs.forEach(input => {
    const label = input.closest('label').querySelector('span:not(.answer-dot)');
    label.textContent = t(`quiz.answers.${input.value}`);
  });
  if (session?.uuid && session?.token) startButtons.forEach(button => { button.querySelector('[data-i18n]')?.replaceChildren(document.createTextNode(t('quiz.resume'))); });
  if (session && questions.length && !document.getElementById('quiz').hidden) render(false, true);
}
document.addEventListener('languagechange', translateQuiz);
translateQuiz();
if (basePath(location.pathname) === '/quiz') await start();
