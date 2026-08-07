import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.js';
import registrationRoutes from './routes/registrations.js';
import householdRoutes from './routes/households.js';
import memberRoutes from './routes/members.js';
import configRoutes from './routes/config.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';
import exportRoutes from './routes/exports.js';
import { apiLimiter } from './middleware/rate-limit.js';

export const app = express();

// Behind a proxy (Render/Railway/nginx) the client IP arrives in X-Forwarded-For;
// rate limiting needs this to key on the real caller rather than the proxy.
app.set('trust proxy', 1);

app.use(helmet());

// Same-origin in production (client is served by the same host, or via the Vite
// proxy in dev). Set CORS_ORIGIN to a comma-separated allowlist when the client
// is deployed separately.
const allowlist = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // Same-origin/curl requests send no Origin header.
      if (!origin) return cb(null, true);
      if (allowlist.length === 0 || allowlist.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
  })
);

app.use(express.json({ limit: '1mb' }));

// Liveness. Deliberately registered before the rate limiter so an uptime
// pinger can never exhaust the budget for real callers.
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Readiness. Touches the database, which doubles as the keep-alive a free-tier
// Postgres needs to avoid being paused for inactivity.
app.get('/api/health/db', async (req, res) => {
  try {
    const { pool } = await import('./db/pool.js');
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'up' });
  } catch (err) {
    console.error('Health check failed to reach the database:', err.message);
    res.status(503).json({ ok: false, db: 'down' });
  }
});

app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/registrations', registrationRoutes);
app.use('/api/households', householdRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/config', configRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/exports', exportRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler. Async routes reach this only because they are wrapped
// in asyncHandler — see lib/http.js.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  if (res.headersSent) return;
  res.status(status).json({
    error: status >= 500 ? 'Something went wrong' : err.message || 'Request failed',
  });
});

// A bug that escapes the handler above should be logged, not silently fatal.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
