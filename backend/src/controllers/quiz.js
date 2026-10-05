import * as quiz from '../services/quiz.js';
import { validateUuid, validateProgress, validateAnswers } from '../utils/validation.js';
import { questions, QUIZ_VERSION } from '../data/questions.js';
import { presentResult } from '../utils/result-view.js';
import { getAppUrl } from '../utils/app-url.js';
export const catalogue = (req, res) => res.json({ version: QUIZ_VERSION, total: questions.length, questions: questions.map(({ id, text, topic }) => ({ id, text, topic })) });
export const start = async (req, res) => res.status(201).json(await quiz.startQuiz());
export const resume = async (req, res) => {
  const session = await quiz.resumeQuiz(validateUuid(req.params.uuid), req.get('X-Quiz-Token'));
  if (session.status === 'COMPLETED') session.resultUrl = `${getAppUrl(req)}/resultado/${session.uuid}`;
  res.json(session);
};
export const progress = async (req, res) => res.json(await quiz.updateProgress(validateUuid(req.params.uuid), req.get('X-Quiz-Token'), validateProgress(req.body)));
export const complete = async (req, res) => {
  const uuid = validateUuid(req.params.uuid);
  const result = await quiz.completeQuiz(uuid, req.get('X-Quiz-Token'), validateAnswers(req.body?.answers, true));
  res.json({ ...presentResult(result), resultUrl: `${getAppUrl(req)}/resultado/${uuid}` });
};
export const share = async (req, res) => res.json(await quiz.shareResult(validateUuid(req.params.uuid)));
export const result = async (req, res) => res.json(await quiz.getResult(validateUuid(req.params.uuid)));
