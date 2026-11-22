require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const path = require('path');

const logger = require('./utils/logger');
const FetchJob = require('./models/FetchJob');
const User = require('./models/User');
const authRoutes = require('./routes/auth');
const resultRoutes = require('./routes/results');
const trConverterRoutes = require('./routes/trConverter');
const { setupSocketHandlers } = require('./socket/socketHandlers');

const app = express();
const server = http.createServer(app);
const PORT = parseInt(process.env.PORT) || 5002;

// ── Socket.IO ──────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
app.set('io', io);
setupSocketHandlers(io);

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api/', rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 200,
  message: { error: 'Too many requests, please try again later.' },
}));

// ── Static exports dir ─────────────────────────────────────────────────────────
app.use('/exports', express.static(path.join(__dirname, '../exports')));

// ── API Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/tr-converter', trConverterRoutes);

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: dbStatus,
    port: PORT,
    mode: process.env.NODE_ENV || 'development',
  });
});

// ── 404 ────────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Global error handler ───────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});


// ── Start server ──────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running on port ${PORT}`);
});

const primaryMongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/rgpv_results';
const fallbackMongoUri = 'mongodb://127.0.0.1:27017/rgpv_results';

async function ensureConfiguredAdmin() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username && !password) return;
  if (!username || !password) {
    logger.error('Both ADMIN_USERNAME and ADMIN_PASSWORD must be configured to seed the admin account');
    return;
  }

  const existingAdmin = await User.findOne({ username });
  if (existingAdmin) {
    if (existingAdmin.role !== 'admin') {
      logger.error(`Configured admin username "${username}" already belongs to a non-admin account`);
    } else if (process.env.ADMIN_EMAIL && existingAdmin.email !== process.env.ADMIN_EMAIL.toLowerCase()) {
      const emailInUse = await User.exists({
        email: process.env.ADMIN_EMAIL.toLowerCase(),
        _id: { $ne: existingAdmin._id },
      });
      if (emailInUse) {
        logger.error('Could not update configured admin email because it is already in use');
      } else {
        existingAdmin.email = process.env.ADMIN_EMAIL.toLowerCase();
        await existingAdmin.save();
        logger.info(`Updated configured admin email for "${username}"`);
      }
    }
    return;
  }

  const email = process.env.ADMIN_EMAIL || `${username}@example.com`;
  if (await User.exists({ email })) {
    logger.error(`Could not create configured admin account: email "${email}" is already in use`);
    return;
  }

  const admin = new User({ username, email, passwordHash: password, role: 'admin' });
  await admin.save();
  logger.info(`Created configured admin account "${username}"`);
}

async function connectDatabase() {
  try {
    await mongoose.connect(primaryMongoUri);
    logger.info('Connected to MongoDB');
  } catch (err) {
    logger.error(`MongoDB connection error: ${err.message}`);
    if (primaryMongoUri !== fallbackMongoUri) {
      try {
        logger.warn(`Attempting fallback to local MongoDB (${fallbackMongoUri})...`);
        await mongoose.connect(fallbackMongoUri);
        logger.info('Connected to local fallback MongoDB');
      } catch (fallbackErr) {
        logger.error(`Local MongoDB fallback error: ${fallbackErr.message}`);
      }
    }
  }
}

connectDatabase().then(async () => {
  if (mongoose.connection.readyState !== 1) return;

  try {
    await ensureConfiguredAdmin();
  } catch (err) {
    logger.error(`Could not initialize configured admin account: ${err.message}`);
  }

  try {
    const result = await FetchJob.updateMany(
      { status: 'running' },
      {
        $set: {
          status: 'paused',
          errorMessage: 'Backend restarted while this job was running. Resume to continue.',
        },
      }
    );
    if (result.modifiedCount > 0) {
      logger.warn(`Marked ${result.modifiedCount} interrupted job(s) as paused for resume`);
    }
  } catch (err) {
    logger.error(`Could not recover interrupted jobs: ${err.message}`);
  }
});

module.exports = { app, server };