import express from 'express';
import User from '../models/User.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// GET all users
router.get('/', async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }); // Exclude password from response
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create new user
router.post('/', async (req, res) => {
  try {
    const { username, email, password, firstName, lastName } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      return res.status(400).json({
        error: 'User with this email or username already exists',
      });
    }

    const user = new User({
      username,
      email,
      password, // In production, hash this password!
      firstName,
      lastName,
    });

    const savedUser = await user.save();
    const { password: _, ...userWithoutPassword } = savedUser.toObject();

    res.status(201).json(userWithoutPassword);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET user by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (
      !id ||
      id === 'linkedin-token' ||
      id === 'cookies' ||
      id === 'linkedin-cookies' ||
      id === 'devices'
    ) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(id, { password: 0 });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update user
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (
      !id ||
      id === 'linkedin-token' ||
      id === 'cookies' ||
      id === 'linkedin-cookies' ||
      id === 'devices'
    ) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const { username, email, firstName, lastName } = req.body;

    const user = await User.findByIdAndUpdate(
      id,
      { username, email, firstName, lastName },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE user
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (
      !id ||
      id === 'linkedin-token' ||
      id === 'cookies' ||
      id === 'linkedin-cookies' ||
      id === 'devices'
    ) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== DEVICE MANAGEMENT ENDPOINTS =====

// POST register new device for user
router.post('/:id/devices', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const { deviceName, browser, platform } = req.body;

    if (!deviceName) {
      return res.status(400).json({ error: 'Device name is required' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const deviceId = uuidv4();
    const newDevice = {
      deviceId,
      deviceName: deviceName || 'Unknown Device',
      browser: browser || 'Chrome',
      platform: platform || 'Desktop',
      lastActive: new Date(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    user.devices.push(newDevice);
    await user.save();

    res.json({
      message: 'Device registered successfully',
      device: newDevice,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET all devices for user
router.get('/:id/devices', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(id, { devices: 1 });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const activeDevices = user.devices.filter((device) => device.isActive);

    res.json({
      devices: activeDevices,
      count: activeDevices.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update device activity
router.put('/:id/devices/:deviceId', async (req, res) => {
  try {
    const { id, deviceId } = req.params;
    if (!id || !deviceId) {
      return res.status(400).json({ error: 'Invalid user ID or device ID' });
    }

    const { deviceName, browser, platform } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const deviceIndex = user.devices.findIndex((d) => d.deviceId === deviceId);
    if (deviceIndex === -1) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Update device
    user.devices[deviceIndex] = {
      ...user.devices[deviceIndex],
      deviceName: deviceName || user.devices[deviceIndex].deviceName,
      browser: browser || user.devices[deviceIndex].browser,
      platform: platform || user.devices[deviceIndex].platform,
      lastActive: new Date(),
      updatedAt: new Date(),
    };

    await user.save();

    res.json({
      message: 'Device updated successfully',
      device: user.devices[deviceIndex],
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE device for user
router.delete('/:id/devices/:deviceId', async (req, res) => {
  try {
    const { id, deviceId } = req.params;
    if (!id || !deviceId) {
      return res.status(400).json({ error: 'Invalid user ID or device ID' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove device
    const deviceIndex = user.devices.findIndex((d) => d.deviceId === deviceId);
    if (deviceIndex === -1) {
      return res.status(404).json({ error: 'Device not found' });
    }

    user.devices.splice(deviceIndex, 1);

    // Remove cookies associated with this device
    user.cookies = user.cookies.filter(
      (cookie) => cookie.deviceId !== deviceId
    );

    await user.save();

    res.json({ message: 'Device and associated cookies deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== LINKEDIN COOKIES ENDPOINTS =====

// POST store LinkedIn cookies from Chrome extension
router.post('/:id/linkedin-cookies', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const { cookies, deviceId, deviceName } = req.body;

    if (!cookies || !Array.isArray(cookies)) {
      return res.status(400).json({ error: 'Cookies array is required' });
    }

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if device exists, if not create it
    let device = user.devices.find((d) => d.deviceId === deviceId);
    if (!device) {
      const newDevice = {
        deviceId,
        deviceName: deviceName || 'Chrome Extension',
        browser: 'Chrome',
        platform: 'Extension',
        lastActive: new Date(),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      user.devices.push(newDevice);
      device = newDevice;
    } else {
      // Update device last active
      device.lastActive = new Date();
      device.updatedAt = new Date();
    }

    // Clear existing LinkedIn cookies for this device
    user.cookies = user.cookies.filter(
      (cookie) =>
        !(
          cookie.domain &&
          cookie.domain.includes('linkedin.com') &&
          cookie.deviceId === deviceId
        )
    );

    // Add new LinkedIn cookies with device tracking
    const linkedinCookies = cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || '.www.linkedin.com',
      path: cookie.path || '/',
      expiresAt: cookie.expiresAt ? new Date(cookie.expiresAt) : null,
      maxAge: cookie.maxAge || null,
      secure: cookie.secure !== undefined ? cookie.secure : true,
      httpOnly: cookie.httpOnly !== undefined ? cookie.httpOnly : false,
      sameSite: cookie.sameSite || 'Lax',
      deviceId: deviceId,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    user.cookies.push(...linkedinCookies);
    await user.save();

    res.json({
      message: 'LinkedIn cookies stored successfully',
      count: linkedinCookies.length,
      cookies: linkedinCookies,
      device: device,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET LinkedIn cookies for a user (all devices)
router.get('/:id/linkedin-cookies', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(id, { cookies: 1, devices: 1 });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Filter LinkedIn cookies
    const linkedinCookies = user.cookies.filter(
      (cookie) =>
        cookie.domain &&
        cookie.domain.includes('linkedin.com') &&
        cookie.isActive
    );

    // Filter out expired cookies
    const currentTime = new Date();
    const activeLinkedinCookies = linkedinCookies.filter((cookie) => {
      if (!cookie.expiresAt) return true;
      return new Date(cookie.expiresAt) > currentTime;
    });

    // Group cookies by device
    const cookiesByDevice = {};
    activeLinkedinCookies.forEach((cookie) => {
      if (!cookiesByDevice[cookie.deviceId]) {
        cookiesByDevice[cookie.deviceId] = [];
      }
      cookiesByDevice[cookie.deviceId].push(cookie);
    });

    res.json({
      cookies: activeLinkedinCookies,
      cookiesByDevice,
      count: activeLinkedinCookies.length,
      devices: user.devices.filter((d) => d.isActive),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET LinkedIn cookies for specific device
router.get('/:id/linkedin-cookies/:deviceId', async (req, res) => {
  try {
    const { id, deviceId } = req.params;
    if (!id || !deviceId) {
      return res.status(400).json({ error: 'Invalid user ID or device ID' });
    }

    const user = await User.findById(id, { cookies: 1, devices: 1 });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Filter LinkedIn cookies for specific device
    const deviceLinkedinCookies = user.cookies.filter(
      (cookie) =>
        cookie.domain &&
        cookie.domain.includes('linkedin.com') &&
        cookie.deviceId === deviceId &&
        cookie.isActive
    );

    // Filter out expired cookies
    const currentTime = new Date();
    const activeDeviceCookies = deviceLinkedinCookies.filter((cookie) => {
      if (!cookie.expiresAt) return true;
      return new Date(cookie.expiresAt) > currentTime;
    });

    const device = user.devices.find((d) => d.deviceId === deviceId);

    res.json({
      cookies: activeDeviceCookies,
      count: activeDeviceCookies.length,
      device: device || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE LinkedIn cookies for a user (all devices)
router.delete('/:id/linkedin-cookies', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove LinkedIn cookies
    const beforeCount = user.cookies.length;
    user.cookies = user.cookies.filter(
      (cookie) => !cookie.domain || !cookie.domain.includes('linkedin.com')
    );
    const afterCount = user.cookies.length;
    const removedCount = beforeCount - afterCount;

    await user.save();

    res.json({
      message: 'LinkedIn cookies deleted successfully',
      removedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE LinkedIn cookies for specific device
router.delete('/:id/linkedin-cookies/:deviceId', async (req, res) => {
  try {
    const { id, deviceId } = req.params;
    if (!id || !deviceId) {
      return res.status(400).json({ error: 'Invalid user ID or device ID' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove LinkedIn cookies for specific device
    const beforeCount = user.cookies.length;
    user.cookies = user.cookies.filter(
      (cookie) =>
        !(
          cookie.domain &&
          cookie.domain.includes('linkedin.com') &&
          cookie.deviceId === deviceId
        )
    );
    const afterCount = user.cookies.length;
    const removedCount = beforeCount - afterCount;

    await user.save();

    res.json({
      message: 'LinkedIn cookies deleted successfully for device',
      removedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== GENERAL COOKIE MANAGEMENT ENDPOINTS =====

// GET all cookies for a user
router.get('/:id/cookies', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(id, { cookies: 1, devices: 1 });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Filter out expired cookies
    const currentTime = new Date();
    const activeCookies = user.cookies.filter((cookie) => {
      if (!cookie.expiresAt) return cookie.isActive;
      return cookie.isActive && new Date(cookie.expiresAt) > currentTime;
    });

    // Group cookies by device
    const cookiesByDevice = {};
    activeCookies.forEach((cookie) => {
      if (!cookiesByDevice[cookie.deviceId]) {
        cookiesByDevice[cookie.deviceId] = [];
      }
      cookiesByDevice[cookie.deviceId].push(cookie);
    });

    res.json({
      cookies: activeCookies,
      cookiesByDevice,
      count: activeCookies.length,
      devices: user.devices.filter((d) => d.isActive),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create/update cookie for a user
router.post('/:id/cookies', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const {
      name,
      value,
      domain,
      path,
      expiresAt,
      maxAge,
      secure,
      httpOnly,
      sameSite,
      deviceId,
    } = req.body;

    if (!name || !value || !deviceId) {
      return res
        .status(400)
        .json({ error: 'Cookie name, value, and device ID are required' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if device exists
    const device = user.devices.find((d) => d.deviceId === deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Check if cookie already exists for this device
    const existingCookieIndex = user.cookies.findIndex(
      (cookie) => cookie.name === name && cookie.deviceId === deviceId
    );

    const cookieData = {
      name,
      value,
      domain: domain || null,
      path: path || '/',
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      maxAge: maxAge || null,
      secure: secure || false,
      httpOnly: httpOnly || false,
      sameSite: sameSite || 'Lax',
      deviceId: deviceId,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (existingCookieIndex !== -1) {
      // Update existing cookie
      user.cookies[existingCookieIndex] = {
        ...user.cookies[existingCookieIndex],
        ...cookieData,
        updatedAt: new Date(),
      };
    } else {
      // Add new cookie
      user.cookies.push(cookieData);
    }

    await user.save();
    res.json({
      message: 'Cookie saved successfully',
      cookie: cookieData,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET specific cookie by name for a user
router.get('/:id/cookies/:cookieName', async (req, res) => {
  try {
    const { id, cookieName } = req.params;
    if (!id || !cookieName) {
      return res.status(400).json({ error: 'Invalid user ID or cookie name' });
    }

    const user = await User.findById(id, { cookies: 1 });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const cookies = user.cookies.filter(
      (c) => c.name === cookieName && c.isActive
    );
    if (cookies.length === 0) {
      return res.status(404).json({ error: 'Cookie not found' });
    }

    // Check if cookies are expired
    const currentTime = new Date();
    const activeCookies = cookies.filter((cookie) => {
      if (!cookie.expiresAt) return true;
      return new Date(cookie.expiresAt) > currentTime;
    });

    if (activeCookies.length === 0) {
      return res
        .status(404)
        .json({ error: 'All instances of this cookie have expired' });
    }

    res.json({ cookies: activeCookies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update specific cookie by name for a user
router.put('/:id/cookies/:cookieName', async (req, res) => {
  try {
    const { id, cookieName } = req.params;
    if (!id || !cookieName) {
      return res.status(400).json({ error: 'Invalid user ID or cookie name' });
    }

    const {
      value,
      domain,
      path,
      expiresAt,
      maxAge,
      secure,
      httpOnly,
      sameSite,
      deviceId,
    } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const cookieIndex = user.cookies.findIndex(
      (c) => c.name === cookieName && c.deviceId === deviceId
    );
    if (cookieIndex === -1) {
      return res
        .status(404)
        .json({ error: 'Cookie not found for this device' });
    }

    // Update cookie
    user.cookies[cookieIndex] = {
      ...user.cookies[cookieIndex],
      value: value || user.cookies[cookieIndex].value,
      domain: domain !== undefined ? domain : user.cookies[cookieIndex].domain,
      path: path || user.cookies[cookieIndex].path,
      expiresAt: expiresAt
        ? new Date(expiresAt)
        : user.cookies[cookieIndex].expiresAt,
      maxAge: maxAge !== undefined ? maxAge : user.cookies[cookieIndex].maxAge,
      secure: secure !== undefined ? secure : user.cookies[cookieIndex].secure,
      httpOnly:
        httpOnly !== undefined ? httpOnly : user.cookies[cookieIndex].httpOnly,
      sameSite: sameSite || user.cookies[cookieIndex].sameSite,
      updatedAt: new Date(),
    };

    await user.save();
    res.json({
      message: 'Cookie updated successfully',
      cookie: user.cookies[cookieIndex],
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE specific cookie by name for a user
router.delete('/:id/cookies/:cookieName', async (req, res) => {
  try {
    const { id, cookieName } = req.params;
    if (!id || !cookieName) {
      return res.status(400).json({ error: 'Invalid user ID or cookie name' });
    }

    const { deviceId } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (deviceId) {
      // Delete cookie for specific device
      const cookieIndex = user.cookies.findIndex(
        (c) => c.name === cookieName && c.deviceId === deviceId
      );
      if (cookieIndex === -1) {
        return res
          .status(404)
          .json({ error: 'Cookie not found for this device' });
      }
      user.cookies.splice(cookieIndex, 1);
    } else {
      // Delete all instances of this cookie across all devices
      user.cookies = user.cookies.filter((c) => c.name !== cookieName);
    }

    await user.save();

    res.json({ message: 'Cookie deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE all cookies for a user
router.delete('/:id/cookies', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.cookies = [];
    await user.save();

    res.json({ message: 'All cookies deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== USER SETTINGS ENDPOINTS =====

// GET user settings
router.get('/:id/settings', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(id, { settings: 1 });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      settings: user.settings || {
        keywords: [
          'Saas',
          'development',
          'web developer',
          'freelance website development',
          'AI tools',
          'Product hunt',
        ],
        postsPerDay: 1,
        engagementLevel: 'moderate',
        startTime: '09:00',
        isActive: true,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update user settings
router.put('/:id/settings', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const { keywords, postsPerDay, engagementLevel, startTime } = req.body;

    const user = await User.findByIdAndUpdate(
      id,
      {
        settings: {
          keywords: keywords || [],
          postsPerDay: postsPerDay || 1,
          engagementLevel: engagementLevel || 'moderate',
          startTime: startTime || '09:00',
          isActive: true,
        },
      },
      { new: true, runValidators: true }
    ).select('settings');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Settings updated successfully',
      settings: user.settings,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ===== LINKEDIN TOKEN ENDPOINTS =====

// POST store LinkedIn token for user
router.post('/:id/linkedin-token', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const { accessToken, refreshToken, expiresAt, tokenType } = req.body;

    const user = await User.findByIdAndUpdate(
      id,
      {
        linkedin: {
          accessToken,
          refreshToken,
          expiresAt,
          tokenType: tokenType || 'Bearer',
        },
      },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET LinkedIn token for user
router.get('/:id/linkedin-token', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(id, { linkedin: 1 });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.linkedin || !user.linkedin.accessToken) {
      return res.status(404).json({ error: 'LinkedIn token not found' });
    }

    res.json(user.linkedin);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE LinkedIn token for user
router.delete('/:id/linkedin-token', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { $unset: { linkedin: 1 } },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'LinkedIn token removed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== COMPREHENSIVE LINKEDIN TOKENS ENDPOINT =====

// POST store comprehensive LinkedIn tokens from extension
router.post('/linkedin-tokens', async (req, res) => {
  try {
    const { userId, tokens, extractedAt, deviceId, deviceName } = req.body;

    if (!userId || !tokens) {
      return res.status(400).json({
        error: 'User ID and tokens are required',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update LinkedIn metadata
    user.linkedin = {
      ...user.linkedin,
      lastExtracted: new Date(),
      extractionCount: (user.linkedin?.extractionCount || 0) + 1,
    };

    // SIMPLIFIED: Only store li_at cookies
    let cookiesUpdated = false;
    let newCookiesCount = 0;
    let updatedCookiesCount = 0;

    if (
      tokens.cookies &&
      Array.isArray(tokens.cookies) &&
      tokens.cookies.length > 0
    ) {
      // Filter only li_at cookies
      const liAtCookies = tokens.cookies.filter(
        (cookie) => cookie.name === 'li_at'
      );

      if (liAtCookies.length === 0) {
        console.log('No li_at cookies found in tokens');
        return res.json({
          message: 'No li_at cookies found',
          extractionCount: user.linkedin.extractionCount,
          cookiesCount: 0,
          newCookiesCount: 0,
          updatedCookiesCount: 0,
          cookiesUpdated: false,
        });
      }

      // Process li_at cookies
      const processedCookies = liAtCookies.map((cookie) => {
        // Handle case where cookie.value might be an object or string
        let cookieValue = cookie.value;
        if (typeof cookieValue === 'object' && cookieValue !== null) {
          // If it's an object, try to extract the value property
          cookieValue = cookieValue.value || JSON.stringify(cookieValue);
        } else {
          cookieValue = String(cookieValue);
        }

        return {
          name: cookie.name,
          value: cookieValue,
          domain: cookie.domain || '.linkedin.com',
          path: cookie.path || '/',
          deviceId: deviceId || 'extension',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      // Get existing li_at cookies for this user
      const existingLiAtCookies = user.cookies.filter(
        (cookie) =>
          cookie.name === 'li_at' && cookie.domain?.includes('linkedin.com')
      );

      // Create a map of existing cookies by name for quick lookup
      const existingCookiesMap = new Map();
      existingLiAtCookies.forEach((cookie) => {
        existingCookiesMap.set(cookie.name, cookie);
      });

      // Process each new li_at cookie
      for (const newCookie of processedCookies) {
        const existingCookie = existingCookiesMap.get(newCookie.name);

        if (!existingCookie) {
          // New cookie - add it
          user.cookies.push(newCookie);
          newCookiesCount++;
          cookiesUpdated = true;
          console.log(`Added new li_at cookie`);
        } else if (existingCookie.value !== newCookie.value) {
          // Cookie value has changed - replace the existing one
          const index = user.cookies.indexOf(existingCookie);
          user.cookies[index] = newCookie;
          updatedCookiesCount++;
          cookiesUpdated = true;
          console.log(`Replaced existing li_at cookie`);
        } else {
          // Cookie exists and value is the same - just update device ID and timestamp
          existingCookie.deviceId = newCookie.deviceId;
          existingCookie.updatedAt = new Date();
          console.log(`li_at cookie unchanged`);
        }
      }

      // Remove any old li_at cookies that are no longer in the new set
      const cookiesToRemove = existingLiAtCookies.filter(
        (cookie) =>
          !processedCookies.some((newCookie) => newCookie.name === cookie.name)
      );

      if (cookiesToRemove.length > 0) {
        user.cookies = user.cookies.filter(
          (cookie) => !cookiesToRemove.includes(cookie)
        );
        console.log(`Removed ${cookiesToRemove.length} old li_at cookies`);
        cookiesUpdated = true;
      }
    }

    await user.save();

    res.json({
      message: cookiesUpdated
        ? 'LinkedIn li_at cookie updated successfully'
        : 'LinkedIn li_at cookie unchanged',
      extractionCount: user.linkedin.extractionCount,
      cookiesCount: liAtCookies ? liAtCookies.length : 0,
      newCookiesCount,
      updatedCookiesCount,
      cookiesUpdated,
      storedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error storing LinkedIn tokens:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET comprehensive LinkedIn tokens for user
router.get('/:id/linkedin-tokens', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(id, { linkedin: 1 });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.linkedin || !user.linkedin.comprehensiveTokens) {
      return res.status(404).json({ error: 'LinkedIn tokens not found' });
    }

    res.json({
      tokens: user.linkedin.comprehensiveTokens,
      lastExtracted: user.linkedin.lastExtracted,
      extractionCount: user.linkedin.extractionCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE comprehensive LinkedIn tokens for user
router.delete('/:id/linkedin-tokens', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findByIdAndUpdate(
      id,
      {
        $unset: {
          'linkedin.comprehensiveTokens': 1,
          'linkedin.lastExtracted': 1,
          'linkedin.extractionCount': 1,
        },
      },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'LinkedIn tokens removed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
