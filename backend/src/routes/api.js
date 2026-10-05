import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAdmin } from '../middlewares/security.js';
import * as quiz from '../controllers/quiz.js';
import * as admin from '../controllers/admin.js';
const limiter = (limit, windowMs) => rateLimit({ limit, windowMs, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' } });
export const api = Router();
// O limitador usa IP apenas transitoriamente em memória; não persiste IPs.
api.use(limiter(1000, 15 * 60_000));
api.get('/quiz/questions', quiz.catalogue);
api.post('/quiz/start', limiter(30, 15 * 60_000), quiz.start);
api.get('/quiz/:uuid', quiz.resume);
api.patch('/quiz/:uuid/progress', quiz.progress);
api.post('/quiz/:uuid/complete', quiz.complete);
api.post('/quiz/:uuid/share', quiz.share);
api.get('/results/:uuid', quiz.result);
// Login é a única exceção de autenticação dentro de /api/admin/*.
api.post('/admin/login', limiter(10, 15 * 60_000), admin.login);
api.use('/admin', requireAdmin, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
api.post('/admin/logout', admin.logout);
api.get('/admin/stats', admin.stats);
api.get('/admin/results', admin.results);
api.get('/admin/distribution', admin.distribution);
api.get('/admin/scatter', admin.scatter);
