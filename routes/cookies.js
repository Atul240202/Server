import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();

// In-memory storage for cookies (in production, use database)
let cookieStore = [];

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Access token required' });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key'
    );
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};

// GET all cookies for current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userCookies = cookieStore.filter(
      (cookie) => cookie.userId === req.userId
    );

    res.json({
      cookies: userCookies,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST create new cookie
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { cookieName, cookieValue, expiresAt } = req.body;

    if (!cookieName || !cookieValue) {
      return res
        .status(400)
        .json({ message: 'Cookie name and value are required' });
    }

    const newCookie = {
      id: Date.now().toString(),
      userId: req.userId,
      name: cookieName,
      value: cookieValue,
      expiresAt: expiresAt || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    cookieStore.push(newCookie);

    res.status(201).json({
      message: 'Cookie created successfully',
      cookie: newCookie,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE specific cookie
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const cookieIndex = cookieStore.findIndex(
      (cookie) => cookie.id === id && cookie.userId === req.userId
    );

    if (cookieIndex === -1) {
      return res.status(404).json({ message: 'Cookie not found' });
    }

    cookieStore.splice(cookieIndex, 1);

    res.json({
      message: 'Cookie deleted successfully',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE all cookies for current user
router.delete('/', authenticateToken, async (req, res) => {
  try {
    cookieStore = cookieStore.filter((cookie) => cookie.userId !== req.userId);

    res.json({
      message: 'All cookies deleted successfully',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
