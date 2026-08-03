import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import registrationRoutes from './routes/registrations.js';
import householdRoutes from './routes/households.js';
import memberRoutes from './routes/members.js';
import configRoutes from './routes/config.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';
import exportRoutes from './routes/exports.js';

export const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/registrations', registrationRoutes);
app.use('/api/households', householdRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/config', configRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/exports', exportRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});
