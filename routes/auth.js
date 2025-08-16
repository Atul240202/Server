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
      user: user,
    });
  } catch (error) {
    res.status(401).json({
      valid: false,
      message: 'Invalid token',
    });
  }
});

// POST check extension status
router.post('/check-extension-status', authenticateToken, async (req, res) => {
  try {
    const { userId, userEmail } = req.body;

    // Get user's extension pairing info from database
    const user = await User.findById(userId).select('extensionPairing');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if user has extension pairing data
    const extensionInfo = user.extensionPairing;

    // Check if pairing attempt has expired (3 minutes)
    if (extensionInfo && extensionInfo.initiatedAt) {
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
      if (
        extensionInfo.initiatedAt < threeMinutesAgo &&
        !extensionInfo.isPaired
      ) {
        // Clear expired pairing attempt
        await User.findByIdAndUpdate(userId, {
          $unset: {
            extensionPairing: 1,
          },
        });

        return res.json({
          success: true,
          isPaired: false,
          extensionInfo: null,
        });
      }
    }

    if (extensionInfo && extensionInfo.isPaired) {
      res.json({
        success: true,
        isPaired: true,
        extensionInfo: {
          userEmail: extensionInfo.userEmail,
          pairedAt: extensionInfo.pairedAt,
          lastActive: extensionInfo.lastActive,
        },
      });
    } else {
      res.json({
        success: true,
        isPaired: false,
        extensionInfo: null,
      });
    }
  } catch (error) {
    console.error('Error checking extension status:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking extension status',
    });
  }
});

// POST initiate pairing
router.post('/initiate-pairing', authenticateToken, async (req, res) => {
  try {
    const { userId, userEmail, authToken, timestamp } = req.body;

    // Store pairing attempt in database
    await User.findByIdAndUpdate(userId, {
      $set: {
        extensionPairing: {
          isPaired: false,
          userEmail: userEmail,
          authToken: authToken,
          initiatedAt: timestamp,
          lastAttempt: new Date(),
        },
      },
    });

    res.json({
      success: true,
      message: 'Pairing initiated successfully',
    });
  } catch (error) {
    console.error('Error initiating pairing:', error);
    res.status(500).json({
      success: false,
      message: 'Error initiating pairing',
    });
  }
});

// POST complete pairing (called by extension)
router.post('/complete-pairing', async (req, res) => {
  try {
    const { userId, userEmail, authToken } = req.body;

    // Verify the auth token
    const decoded = jwt.verify(
      authToken,
      process.env.JWT_SECRET || 'your-secret-key'
    );

    if (decoded.userId !== userId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token',
      });
    }

    // Update user's extension pairing status
    await User.findByIdAndUpdate(userId, {
      $set: {
        extensionPairing: {
          isPaired: true,
          userEmail: userEmail,
          pairedAt: new Date(),
          lastActive: new Date(),
        },
      },
    });

    res.json({
      success: true,
      message: 'Extension paired successfully',
    });
  } catch (error) {
    console.error('Error completing pairing:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing pairing',
    });
  }
});

// POST disconnect extension
router.post('/disconnect-extension', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.body;

    // Clear extension pairing data
    await User.findByIdAndUpdate(userId, {
      $unset: {
        extensionPairing: 1,
      },
    });

    res.json({
      success: true,
      message: 'Extension disconnected successfully',
    });
  } catch (error) {
    console.error('Error disconnecting extension:', error);
    res.status(500).json({
      success: false,
      message: 'Error disconnecting extension',
    });
  }
});

export default router;
