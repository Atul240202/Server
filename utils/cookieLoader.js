import User from '../models/User.js';

/**
 * Load li_at cookies for a specific user from MongoDB
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} Array of li_at cookie objects
 */
export async function loadCookiesFromDB(userId) {
  try {
    console.log(`Loading li_at cookies for user: ${userId}`);

    const user = await User.findById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Get only li_at cookies for the user
    const liAtCookies = user.cookies.filter(
      (cookie) =>
        cookie.name === 'li_at' &&
        cookie.domain &&
        cookie.domain.includes('linkedin.com')
    );

    // Filter out expired cookies
    const currentTime = new Date();
    const activeCookies = liAtCookies.filter((cookie) => {
      if (!cookie.expiresAt) return true;
      return new Date(cookie.expiresAt) > currentTime;
    });

    // Get only the most recent li_at cookie
    let mostRecentCookie = null;
    activeCookies.forEach((cookie) => {
      if (!mostRecentCookie || cookie.updatedAt > mostRecentCookie.updatedAt) {
        mostRecentCookie = cookie;
      }
    });

    if (!mostRecentCookie) {
      console.log(`No valid li_at cookies found for user ${userId}`);
      return [];
    }

    console.log(`Found 1 li_at cookie for user ${userId}`);

    // Convert to Puppeteer-compatible format (matching working script exactly)
    const puppeteerCookie = {
      name: mostRecentCookie.name, // 'li_at'
      value: mostRecentCookie.value,
      domain: '.www.linkedin.com', // ← CRITICAL: Match working script domain
      path: '/', // ← CRITICAL: Match working script path
      httpOnly: true,
      secure: true,
      // do NOT set expires if you don't have it (session cookie ok)
    };

    return [puppeteerCookie];
  } catch (error) {
    console.error(
      `Error loading li_at cookies for user ${userId}:`,
      error.message
    );
    throw error;
  }
}

/**
 * Load li_at cookies for a specific user (alias for loadCookiesFromDB)
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} Array of li_at cookie objects
 */
export async function loadLinkedInCookies(userId) {
  return await loadCookiesFromDB(userId);
}

/**
 * Load li_at cookies for a specific user and device from MongoDB
 * @param {string} userId - The user ID
 * @param {string} deviceId - The device ID (optional)
 * @returns {Promise<Array>} Array of li_at cookie objects
 */
export async function loadCookiesFromDBByDevice(userId, deviceId = null) {
  try {
    console.log(
      `Loading li_at cookies for user: ${userId}, device: ${deviceId || 'any'}`
    );

    const user = await User.findById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Get li_at cookies for the user
    let liAtCookies = user.cookies.filter(
      (cookie) =>
        cookie.name === 'li_at' &&
        cookie.domain &&
        cookie.domain.includes('linkedin.com')
    );

    // Filter by device if specified
    if (deviceId) {
      liAtCookies = liAtCookies.filter(
        (cookie) => cookie.deviceId === deviceId
      );
    }

    // Filter out expired cookies
    const currentTime = new Date();
    const activeCookies = liAtCookies.filter((cookie) => {
      if (!cookie.expiresAt) return true;
      return new Date(cookie.expiresAt) > currentTime;
    });

    // Get only the most recent li_at cookie
    let mostRecentCookie = null;
    activeCookies.forEach((cookie) => {
      if (!mostRecentCookie || cookie.updatedAt > mostRecentCookie.updatedAt) {
        mostRecentCookie = cookie;
      }
    });

    if (!mostRecentCookie) {
      console.log(
        `No valid li_at cookies found for user ${userId}${
          deviceId ? ` on device ${deviceId}` : ''
        }`
      );
      return [];
    }

    console.log(
      `Found 1 li_at cookie for user ${userId}${
        deviceId ? ` on device ${deviceId}` : ''
      }`
    );

    // Convert to Puppeteer-compatible format (matching working script exactly)
    const puppeteerCookie = {
      name: mostRecentCookie.name, // 'li_at'
      value: mostRecentCookie.value,
      domain: '.www.linkedin.com', // ← CRITICAL: Match working script domain
      path: '/', // ← CRITICAL: Match working script path
      httpOnly: true,
      secure: true,
      // do NOT set expires if you don't have it (session cookie ok)
    };

    return [puppeteerCookie];
  } catch (error) {
    console.error(
      `Error loading li_at cookies for user ${userId}:`,
      error.message
    );
    throw error;
  }
}

/**
 * Check if user has valid li_at cookies
 * @param {string} userId - The user ID
 * @returns {Promise<boolean>} True if user has valid li_at cookies
 */
export async function hasValidLinkedInCookies(userId) {
  try {
    const cookies = await loadCookiesFromDB(userId);
    return cookies.length > 0;
  } catch (error) {
    console.error(
      `Error checking li_at cookies for user ${userId}:`,
      error.message
    );
    return false;
  }
}
