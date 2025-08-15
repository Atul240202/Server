import express from 'express';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = express.Router();

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
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid token' });
  }
};

// POST register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ message: 'Username, email and password are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }],
    });

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create new user
    const user = new User({
      username,
      email: email.toLowerCase(),
      password: hashedPassword,
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Return user data (without password)
    const { password: _, ...userWithoutPassword } = user.toObject();

    // Add id field for frontend compatibility
    const userResponse = {
      ...userWithoutPassword,
      id: userWithoutPassword._id,
    };

    res.status(201).json({
      message: 'Registration successful',
      user: userResponse,
      token,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'Email and password are required' });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Return user data (without password)
    const { password: _, ...userWithoutPassword } = user.toObject();

    // Add id field for frontend compatibility
    const userResponse = {
      ...userWithoutPassword,
      id: userWithoutPassword._id,
    };

    res.json({
      message: 'Login successful',
      user: userResponse,
      token,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // Add id field for frontend compatibility
    const userResponse = {
      ...req.user.toObject(),
      id: req.user._id,
    };

    res.json({
      user: userResponse,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST logout
router.post('/logout', (req, res) => {
  res.json({ message: 'Logout successful' });
});

// POST verify token (for extension pairing)
router.post('/verify-token', async (req, res) => {
  try {
    const { token, userId } = req.body;

    if (!token || !userId) {
      return res.status(400).json({
        valid: false,
        message: 'Token and userId are required',
      });
    }

    // Verify the JWT token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key'
    );

    // Check if the token belongs to the specified user
    if (decoded.userId !== userId) {
      return res.status(401).json({
        valid: false,
        message: 'Token does not match user',
      });
    }

    // Check if user exists
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(401).json({
        valid: false,
        message: 'User not found',
      });
    }

    res.json({
      valid: true,
      message: 'Token verified successfully',
      user: user,
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({
      valid: false,
      message: 'Invalid token',
    });
  }
});

export default router;
