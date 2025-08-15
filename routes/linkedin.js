import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();

// In-memory storage for LinkedIn data (in production, use database)
let linkedinDataStore = [];

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

// POST store LinkedIn data
router.post('/data', authenticateToken, async (req, res) => {
  try {
    const { cookies, userAgent, timestamp, url } = req.body;

    if (!cookies || !Array.isArray(cookies)) {
      return res.status(400).json({ message: 'Cookies array is required' });
    }

    const dataEntry = {
      id: Date.now().toString(),
      userId: req.userId,
      cookies,
      userAgent: userAgent || 'Unknown',
      timestamp: timestamp || new Date().toISOString(),
      url: url || 'Unknown',
      createdAt: new Date().toISOString(),
    };

    linkedinDataStore.push(dataEntry);

    res.status(201).json({
      message: 'LinkedIn data stored successfully',
      data: dataEntry,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET retrieve LinkedIn data for current user
router.get('/data', authenticateToken, async (req, res) => {
  try {
    const userData = linkedinDataStore.filter(
      (entry) => entry.userId === req.userId
    );

    res.json({
      message: 'LinkedIn data retrieved successfully',
      data: userData,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE clear LinkedIn data for current user
router.delete('/data', authenticateToken, async (req, res) => {
  try {
    linkedinDataStore = linkedinDataStore.filter(
      (entry) => entry.userId !== req.userId
    );

    res.json({
      message: 'LinkedIn data cleared successfully',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
