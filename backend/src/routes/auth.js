const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const FetchJob = require('../models/FetchJob');
const StudentResult = require('../models/StudentResult');
const DownloadHistory = require('../models/DownloadHistory');
const { authenticate, authorize } = require('../middleware/auth');
const JobProcessor = require('../services/jobProcessor');
const logger = require('../utils/logger');

const router = express.Router();

const generateToken = (userId) => jwt.sign(
      { userId },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);

// Register
router.post('/register', [
      body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters'),
      body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
      body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
      body('collegeCode').optional().trim(),
      body('collegeName').optional().trim(),
], async (req, res, next) => {
      try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                  return res.status(400).json({ errors: errors.array() });
            }

            const { username, email, password, collegeCode, collegeName } = req.body;

            const existing = await User.findOne({ $or: [{ email }, { username }] });
            if (existing) {
                  return res.status(409).json({ error: 'Username or email already exists' });
            }

            const user = new User({ username, email, passwordHash: password, collegeCode, collegeName });
            await user.save();

            const token = generateToken(user._id);
            res.status(201).json({ token, user: user.toSafeObject() });
      } catch (err) {
            next(err);
      }
});

// Login
router.post('/login', [
      body('identifier').optional().trim().notEmpty(),
      body('email').optional().isEmail().normalizeEmail(),
      body('password').notEmpty(),
], async (req, res, next) => {
      try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                  return res.status(400).json({ errors: errors.array() });
            }

            const identifier = req.body.identifier || req.body.email;
            const { password } = req.body;
            if (typeof identifier !== 'string' || !identifier.trim()) {
                  return res.status(400).json({ error: 'Email or username required' });
            }
            const user = await User.findOne({
                  $or: [
                        { email: identifier.trim().toLowerCase() },
                        { username: identifier.trim() },
                  ],
            });
            if (!user) {
                  return res.status(401).json({ error: 'Invalid credentials' });
            }
            if (!user.isActive) {
                  return res.status(403).json({ error: 'Your account is blocked. Please contact the owner.' });
            }

            const valid = await user.comparePassword(password);
            if (!valid) {
                  return res.status(401).json({ error: 'Invalid credentials' });
            }

            user.lastLogin = new Date();
            await user.save();

            const token = generateToken(user._id);
            res.json({ token, user: user.toSafeObject() });
      } catch (err) {
            next(err);
      }
});

// Create a regular user account. Credentials are persisted in MongoDB.
router.post('/admin/users', authenticate, authorize('admin'), [
      body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
      body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], async (req, res, next) => {
      try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                  return res.status(400).json({ errors: errors.array() });
            }

            const { email, password } = req.body;
            if (await User.exists({ email })) {
                  return res.status(409).json({ error: 'An account with this email already exists' });
            }

            const usernameBase = email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'user';
            let username = usernameBase;
            let suffix = 1;
            while (await User.exists({ username })) {
                  const suffixText = `-${suffix++}`;
                  username = `${usernameBase.slice(0, 50 - suffixText.length)}${suffixText}`;
            }

            const user = new User({ username, email, passwordHash: password });
            await user.save();
            res.status(201).json({ user: user.toSafeObject() });
      } catch (err) {
            if (err.code === 11000) {
                  return res.status(409).json({ error: 'An account with this email already exists' });
            }
            next(err);
      }
});

router.get('/admin/users', authenticate, authorize('admin'), async (req, res, next) => {
      try {
            const users = await User.find({ role: { $ne: 'admin' } })
                  .select('-passwordHash')
                  .sort({ createdAt: -1 });
            res.json({ users: users.map(user => user.toSafeObject()) });
      } catch (err) {
            next(err);
      }
});

router.patch('/admin/users/:id/status', authenticate, authorize('admin'), [
      body('isActive').isBoolean().withMessage('isActive must be a boolean'),
], async (req, res, next) => {
      try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                  return res.status(400).json({ errors: errors.array() });
            }
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                  return res.status(400).json({ error: 'Invalid user ID' });
            }

            const user = await User.findOne({
                  _id: req.params.id,
                  role: { $ne: 'admin' },
            });
            if (!user) {
                  return res.status(404).json({ error: 'User not found' });
            }

            user.isActive = req.body.isActive;
            await user.save();
            res.json({ user: user.toSafeObject() });
      } catch (err) {
            next(err);
      }
});

router.patch('/admin/users/:id', authenticate, authorize('admin'), [
      body('username').optional().trim().isLength({ min: 3, max: 50 })
            .withMessage('Username must be 3-50 characters'),
      body('email').optional().isEmail().normalizeEmail().withMessage('Valid email required'),
      body('password').optional({ checkFalsy: true }).isLength({ min: 6 })
            .withMessage('Password must be at least 6 characters'),
], async (req, res, next) => {
      try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                  return res.status(400).json({ errors: errors.array() });
            }
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                  return res.status(400).json({ error: 'Invalid user ID' });
            }

            const user = await User.findOne({
                  _id: req.params.id,
                  role: { $ne: 'admin' },
            });
            if (!user) {
                  return res.status(404).json({ error: 'User not found' });
            }

            const { username, email, password } = req.body;
            if (username === undefined && email === undefined && !password) {
                  return res.status(400).json({ error: 'Provide a username, email, or password to update' });
            }

            const conflicts = [];
            if (username !== undefined) conflicts.push({ username });
            if (email !== undefined) conflicts.push({ email });
            if (conflicts.length && await User.exists({ _id: { $ne: user._id }, $or: conflicts })) {
                  return res.status(409).json({ error: 'Username or email is already in use' });
            }

            if (username !== undefined) user.username = username;
            if (email !== undefined) user.email = email;
            if (password) user.passwordHash = password;
            await user.save();
            res.json({ user: user.toSafeObject() });
      } catch (err) {
            if (err.code === 11000) {
                  return res.status(409).json({ error: 'Username or email is already in use' });
            }
            next(err);
      }
});

router.delete('/admin/users/:id', authenticate, authorize('admin'), async (req, res, next) => {
      try {
            if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
                  return res.status(400).json({ error: 'Invalid user ID' });
            }

            const user = await User.findOne({
                  _id: req.params.id,
                  role: { $ne: 'admin' },
            });
            if (!user) {
                  return res.status(404).json({ error: 'User not found' });
            }

            user.isActive = false;
            await user.save();

            const jobs = await FetchJob.find({ userId: user._id }).select('_id status');
            const jobProcessor = new JobProcessor(req.app.get('io'));
            for (const job of jobs) {
                  if (job.status === 'running' || job.status === 'paused') {
                        await jobProcessor.cancelJob(job._id);
                  }
            }

            const downloadRecords = await DownloadHistory.find({ userId: user._id }).select('filePath');
            const exportsDir = path.resolve(__dirname, '../../exports');
            const deletedFilePaths = new Set();
            for (const record of downloadRecords) {
                  if (!record.filePath) continue;

                  const filePath = path.resolve(record.filePath);
                  const relativePath = path.relative(exportsDir, filePath);
                  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
                        logger.warn(`Skipping user export outside the exports directory: ${filePath}`);
                        continue;
                  }
                  if (deletedFilePaths.has(filePath)) continue;
                  if (await DownloadHistory.exists({ filePath: record.filePath, userId: { $ne: user._id } })) {
                        continue;
                  }
                  deletedFilePaths.add(filePath);
                  await fs.promises.unlink(filePath).catch(err => {
                        if (err.code !== 'ENOENT') throw err;
                  });
            }

            const jobIds = jobs.map(job => job._id);
            await StudentResult.deleteMany({ jobId: { $in: jobIds } });
            await DownloadHistory.deleteMany({ userId: user._id });
            await FetchJob.deleteMany({ userId: user._id });
            await User.deleteOne({ _id: user._id });

            res.json({ message: 'User and associated data deleted successfully' });
      } catch (err) {
            next(err);
      }
});

// Get current user
router.get('/me', authenticate, (req, res) => {
      res.json({ user: req.user });
});

module.exports = router;
