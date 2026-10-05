import * as quiz from '../services/quiz.js';
import { validateUuid, validateProgress, validateAnswers } from '../utils/validation.js';
import { config } from '../config.js';
import { questions, QUIZ_VERSION } from '../data/questions.js';
export const catalogue = (req, res) => res.json({ version: QUIZ_VERSION, total: questions.length, questions: questions.map(({ id, text, topic }) => ({ id, text, topic })) });
export const start = async (req, res) => res.status(201).json(await quiz.startQuiz());
export const resume = async (req, res) => res.json(await quiz.resumeQuiz(validateUuid(req.params.uuid), req.get('X-Quiz-Token')));
export const progress = async (req, res) => res.json(await quiz.updateProgress(validateUuid(req.params.uuid), req.get('X-Quiz-Token'), validateProgress(req.body)));
export const complete = async (req, res) => {
  const uuid = validateUuid(req.params.uuid);
  const result = await quiz.completeQuiz(uuid, req.get('X-Quiz-Token'), validateAnswers(req.body?.answers, true));
  res.json({ ...result, resultUrl: `${config.appUrl}/resultado/${uuid}` });
};
export const share = async (req, res) => res.json(await quiz.shareResult(validateUuid(req.params.uuid)));
export const result = async (req, res) => res.json(await quiz.getResult(validateUuid(req.params.uuid)));
