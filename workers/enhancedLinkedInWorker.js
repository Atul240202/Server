import { Worker } from 'bullmq';
import puppeteer from 'puppeteer';
import Redis from 'ioredis';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Import utilities and models
import {
  loadLinkedInCookies,
  validateLinkedInSession,
} from '../utils/cookieLoader.js';
import { generateAdvancedAIComment } from '../utils/aiCommentGenerator.js';
import CommentJob from '../models/CommentJob.js';
import Post from '../models/Post.js';
import SessionReport from '../models/SessionReport.js';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
});

class LinkedInWorker {
  constructor() {
    this.browserProfiles = new Map(); // Cache browser profiles per user
  }

  async getBrowserDataDir(userId) {
    const profileDir = path.join(
      __dirname,
      '..',
      'browser-profiles',
      userId.toString()
    );
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }
    return profileDir;
  }

  async launchBrowser(userId) {
    const userDataDir = await this.getBrowserDataDir(userId);

    const browser = await puppeteer.launch({
      headless: process.env.NODE_ENV === 'production',
      userDataDir, // Persistent user profile
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--start-maximized',
      ],
      defaultViewport: null,
    });

    return browser;
  }

  async setupPage(browser) {
    const page = await browser.newPage();

    // Set user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Add stealth features
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Override other detection methods
      window.navigator.chrome = {
        runtime: {},
      };

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);
    });

    return page;
  }

  async loginWithCookies(page, userId) {
    try {
      // Load all cookies from database
      const cookies = await loadLinkedInCookies(userId);

      if (!cookies || cookies.length === 0) {
        throw new Error('No cookies found for user');
      }

      // Set cookies before navigation
      for (const cookie of cookies) {
        try {
          await page.setCookie(cookie);
        } catch (err) {
          console.warn(`Failed to set cookie ${cookie.name}:`, err.message);
        }
      }

      // Navigate to LinkedIn
      await page.goto('https://www.linkedin.com/feed/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      // Wait for potential redirects
      await page.waitForTimeout(5000);

      // Validate session
      const isValid = await validateLinkedInSession(page, userId);

      if (!isValid) {
        // Try to refresh session
        await page.goto('https://www.linkedin.com/feed/', {
          waitUntil: 'networkidle2',
          timeout: 60000,
        });

        // Check again
        const isValidAfterRefresh = await validateLinkedInSession(page, userId);
        if (!isValidAfterRefresh) {
          throw new Error('Session validation failed after refresh');
        }
      }

      console.log(`Successfully logged in user ${userId}`);
      return true;
    } catch (error) {
      console.error(`Login failed for user ${userId}:`, error);

      // Update user cookies as invalid
      await User.findByIdAndUpdate(userId, {
        $set: { 'linkedin.lastExtracted': null },
      });

      throw error;
    }
  }

  async processJob(job) {
    const { jobId, userId, keywords, maxComments, options } = job.data;
    let browser = null;

    try {
      // Update job status
      await CommentJob.findByIdAndUpdate(jobId, {
        status: 'active',
        startedAt: new Date(),
      });

      // Launch browser with user profile
      browser = await this.launchBrowser(userId);
      const page = await this.setupPage(browser);

      // Login with cookies
      await this.loginWithCookies(page, userId);

      // Implement scraping logic here...
      // (Use the scraping logic from the previous implementation)

      return { success: true };
    } catch (error) {
      console.error(`Job ${jobId} failed:`, error);

      await CommentJob.findByIdAndUpdate(jobId, {
        status: 'failed',
        error: error.message,
        completedAt: new Date(),
      });

      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}

// Create worker instance
const linkedInWorker = new LinkedInWorker();

const worker = new Worker(
  'comment-jobs',
  async (job) => linkedInWorker.processJob(job),
  {
    connection: redis,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY) || 1,
  }
);

export default worker;
