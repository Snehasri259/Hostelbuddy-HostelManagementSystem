import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { ping } from './db.js';
import { HttpError, asyncRoute } from './utils.js';
import { authenticate } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import dashboardRouter from './routes/dashboard.js';
import studentsRouter from './routes/students.js';
import { allocationsRouter, bedsRouter, blocksRouter, roomsRouter } from './routes/housing.js';
import { complaintsRouter, noticesRouter } from './routes/community.js';
import { guardiansRouter, outpassesRouter, visitorsRouter } from './routes/requests.js';
import { notificationsRouter, reportsRouter } from './routes/misc.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.cookieSecure ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  }));

  const api = express.Router();
  api.use(cors({ origin: config.origins, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'X-HB-CSRF'], maxAge: 600 }));
  api.use(express.json({ limit: '100kb' }));
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  // Generic per-IP ceiling for the whole API (login/reset have their own, stricter limits).
  api.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 1500, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many requests. Please slow down.' } }));
  // CSRF defence in depth (on top of SameSite cookies + CORS allow-list): browsers cannot add custom headers cross-site.
  api.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('X-HB-CSRF') !== '1') return next(new HttpError(403, 'Missing security header.'));
    next();
  });

  api.get('/health', (req, res) => res.json({ status: 'ok', service: 'HostelBuddy API' }));
  api.get('/health/ready', asyncRoute(async (req, res) => {
    try { await ping(); res.json({ status: 'ready' }); } catch { res.status(503).json({ status: 'database unavailable' }); }
  }));

  api.use('/auth', authRouter);
  const protectedApi = express.Router();
  protectedApi.use(authenticate());
  protectedApi.use('/dashboard', dashboardRouter);
  protectedApi.use('/blocks', blocksRouter);
  protectedApi.use('/students', studentsRouter);
  protectedApi.use('/rooms', roomsRouter);
  protectedApi.use('/beds', bedsRouter);
  protectedApi.use('/allocations', allocationsRouter);
  protectedApi.use('/complaints', complaintsRouter);
  protectedApi.use('/notices', noticesRouter);
  protectedApi.use('/guardians', guardiansRouter);
  protectedApi.use('/visitors', visitorsRouter);
  protectedApi.use('/outpasses', outpassesRouter);
  protectedApi.use('/notifications', notificationsRouter);
  protectedApi.use('/reports', reportsRouter);
  api.use(protectedApi);
  api.use((req, res) => res.status(404).json({ message: 'Not found.' }));
  app.use('/api', api);

  if (config.serveFrontend) {
    const dist = process.env.FRONTEND_DIST || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
    if (fs.existsSync(path.join(dist, 'index.html'))) {
      app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', index: false }));
      app.use(express.static(dist, { maxAge: '1h', index: false }));
      app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
    } else {
      console.warn(`SERVE_FRONTEND is on but ${dist}/index.html was not found. Run "npm run build" in frontend/.`);
    }
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof HttpError) return res.status(err.status).json({ message: err.message, code: err.code });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Request body is not valid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Request body is too large.' });
    switch (err.code) {
      case 'ER_DUP_ENTRY': return res.status(409).json({ message: 'That record already exists (duplicate ID, email or phone).' });
      case 'ER_NO_REFERENCED_ROW_2': return res.status(400).json({ message: 'A referenced record does not exist.' });
      case 'ER_DATA_TOO_LONG':
      case 'ER_TRUNCATED_WRONG_VALUE':
      case 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD':
      case 'ER_WARN_DATA_OUT_OF_RANGE':
      case 'ER_CHECK_CONSTRAINT_VIOLATED': return res.status(400).json({ message: 'One of the submitted values is invalid or too long.' });
      default: break;
    }
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    res.status(500).json({ message: 'Unexpected server error. Please try again.' });
  });
  return app;
}
