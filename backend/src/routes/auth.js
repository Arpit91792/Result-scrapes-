const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

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
      body('email').isEmail().normalizeEmail(),
      body('password').notEmpty(),
], async (req, res, next) => {
      try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                  return res.status(400).json({ errors: errors.array() });
            }

            const { email, password } = req.body;
            const user = await User.findOne({ email });
            if (!user || !user.isActive) {
                  return res.status(401).json({ error: 'Invalid credentials' });
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

// Get current user
router.get('/me', authenticate, (req, res) => {
      res.json({ user: req.user });
});

module.exports = router;
