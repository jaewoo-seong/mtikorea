require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { getPool } = require('./lib/db');
const { loadUser, requireAuth } = require('./lib/auth');
const { rootDir } = require('./lib/storage');

const authRoutes = require('./routes/auth');
const clientsRoutes = require('./routes/clients');
const emailsRoutes = require('./routes/emails');
const projectsRoutes = require('./routes/projects');
const documentsRoutes = require('./routes/documents');
const tasksRoutes = require('./routes/tasks');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 4000;
const isProd = process.env.NODE_ENV === 'production';

rootDir();

app.set('trust proxy', 1);
app.use(
  cors({
    origin: process.env.APP_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());

const sessionStore = process.env.DATABASE_URL
  ? new pgSession({
      pool: getPool(),
      tableName: 'sessions',
      createTableIfMissing: false,
    })
  : undefined;

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'dev-insecure-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use(loadUser);

app.get('/health', async (_req, res) => {
  try {
    await getPool().query('SELECT 1');
    res.json({
      status: 'ok',
      service: 'api',
      db: 'railway-postgres',
      supabase: false,
      storage: process.env.STORAGE_PATH || './data',
    });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

app.use('/auth', authRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/emails', emailsRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/bootstrap', requireAuth, async (req, res) => {
  res.json({
    user: req.user,
    features: {
      googleOauth: Boolean(process.env.GOOGLE_CLIENT_ID),
      gmail: Boolean(process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_CLIENT_ID),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    },
  });
});

const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/auth')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) next();
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MTI CRM API on :${PORT}`);
  });
}

module.exports = app;
