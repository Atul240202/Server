import User from '../models/User.js';

/**
 * Load cookies for a specific user from MongoDB
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} Array of cookie objects
 */
export async function loadCookiesFromDB(userId) {
  try {
    console.log(`Loading cookies for user: ${userId}`);

    const user = await User.findById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Get LinkedIn cookies for the user
    const linkedinCookies = user.cookies.filter(
      (cookie) =>
        cookie.domain &&
        cookie.domain.includes('linkedin.com') &&
        cookie.isActive
    );

    // Filter out expired cookies
    const currentTime = new Date();
    const activeCookies = linkedinCookies.filter((cookie) => {
      if (!cookie.expiresAt) return true;
      return new Date(cookie.expiresAt) > currentTime;
    });

    // Filter for essential LinkedIn cookies (JSESSIONID, li_at)
    const essentialCookies = activeCookies.filter(
      (cookie) => cookie.name === 'JSESSIONID' || cookie.name === 'li_at'
    );

    console.log(
      `Found ${essentialCookies.length} active LinkedIn cookies for user ${userId}`
    );

    // Convert to Puppeteer-compatible format
    const puppeteerCookies = essentialCookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expiresAt
        ? Math.floor(new Date(cookie.expiresAt).getTime() / 1000)
        : -1,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    }));

    return puppeteerCookies;
  } catch (error) {
    console.error(`Error loading cookies for user ${userId}:`, error.message);
    throw error;
  }
}

/**
 * Load LinkedIn cookies for a specific user (alias for loadCookiesFromDB)
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} Array of LinkedIn cookie objects
 */
export async function loadLinkedInCookies(userId) {
  return await loadCookiesFromDB(userId);
}

/**
 * Load cookies for a specific user and device from MongoDB
 * @param {string} userId - The user ID
 * @param {string} deviceId - The device ID (optional)
 * @returns {Promise<Array>} Array of cookie objects
 */
export async function loadCookiesFromDBByDevice(userId, deviceId = null) {
  try {
    console.log(
      `Loading cookies for user: ${userId}, device: ${deviceId || 'any'}`
    );

    const user = await User.findById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Get LinkedIn cookies for the user
    let linkedinCookies = user.cookies.filter(
      (cookie) =>
        cookie.domain &&
        cookie.domain.includes('linkedin.com') &&
        cookie.isActive
    );

    // Filter by device if specified
    if (deviceId) {
      linkedinCookies = linkedinCookies.filter(
        (cookie) => cookie.deviceId === deviceId
      );
    }

    // Filter out expired cookies
    const currentTime = new Date();
    const activeCookies = linkedinCookies.filter((cookie) => {
      if (!cookie.expiresAt) return true;
      return new Date(cookie.expiresAt) > currentTime;
    });

    // Filter for essential LinkedIn cookies (JSESSIONID, li_at)
    const essentialCookies = activeCookies.filter(
      (cookie) => cookie.name === 'JSESSIONID' || cookie.name === 'li_at'
    );

    console.log(
      `Found ${
        essentialCookies.length
      } active LinkedIn cookies for user ${userId}${
        deviceId ? ` on device ${deviceId}` : ''
      }`
    );

    // Convert to Puppeteer-compatible format
    const puppeteerCookies = essentialCookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expiresAt
        ? Math.floor(new Date(cookie.expiresAt).getTime() / 1000)
        : -1,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    }));

    return puppeteerCookies;
  } catch (error) {
    console.error(`Error loading cookies for user ${userId}:`, error.message);
    throw error;
  }
}

/**
 * Check if user has valid LinkedIn cookies
 * @param {string} userId - The user ID
 * @returns {Promise<boolean>} True if user has valid cookies
 */
export async function hasValidLinkedInCookies(userId) {
  try {
    const cookies = await loadCookiesFromDB(userId);
    return cookies.length >= 2; // At least JSESSIONID and li_at
  } catch (error) {
    console.error(`Error checking cookies for user ${userId}:`, error.message);
    return false;
  }
}
