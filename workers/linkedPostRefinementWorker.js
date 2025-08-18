import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Setup logging
const logFile = path.join(__dirname, 'worker-logs.txt');
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());

  // Append to log file
  try {
    fs.appendFileSync(logFile, logMessage);
  } catch (error) {
    console.error('Failed to write to log file:', error.message);
  }
}

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: null, // BullMQ requirement
});

function makeRequest(url, options) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          text: () => Promise.resolve(data),
          json: () => Promise.resolve(JSON.parse(data)),
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/**
 * AI Comment Generation
 *
 * AI Config Var:
 * - wantEmoji (boolean):
 * - wantHashtags (boolean):
 * - messageTone (string): 'professional', 'casual', 'enthusiastic', 'thoughtful'
 * - maxLength (number): Max words in comment
 *
 *
 * updateAIConfig({
 *   wantEmoji: false,
 *   wantHashtags: true,
 *   messageTone: 'enthusiastic',
 *   maxLength: 30
 * });
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// const COOKIE_PATH = path.join(__dirname, 'linkedin_cookies.json');
// const SCRAPED_PATH = path.join(__dirname, 'scraped_posts.json');
const COMMENT_TEXT = 'Really great thought';
const scheduledTime = new Date('2025-07-18T00:55:00');

const AI_CONFIG = {
  wantEmoji: false,
  wantHashtags: false,
  messageTone: 'professional',
  maxLength: 25,
};

function updateAIConfig(newConfig) {
  if (newConfig.wantEmoji !== undefined)
    AI_CONFIG.wantEmoji = newConfig.wantEmoji;
  if (newConfig.wantHashtags !== undefined)
    AI_CONFIG.wantHashtags = newConfig.wantHashtags;
  if (newConfig.messageTone !== undefined)
    AI_CONFIG.messageTone = newConfig.messageTone;
  if (newConfig.maxLength !== undefined)
    AI_CONFIG.maxLength = newConfig.maxLength;

  console.log('AI Configuration updated:', AI_CONFIG);
}

function getAIConfig() {
  return { ...AI_CONFIG };
}

const TARGET_KEYWORDS = [
  'Startup',
  'AI',
  'AI Tools',
  'ChatGpt',
  'Saas',
  'Product Hunt',
];

const STOP_WORDS = [
  'hiring',
  "we're looking for",
  'job opportunity',
  'new position at',
  'looking for',
  'join our team',
  'work anniversary',
  'started a new position',
  'say congrats',
  'congratulations',
  'happy work anniversary',
  'celebrating',
];

const TARGET_COMMENT_LIMIT = 5;
const SCRAPE_BUFFER = 1.5; // 50% more
const SCRAPE_TARGET = Math.ceil(TARGET_COMMENT_LIMIT * SCRAPE_BUFFER);

function isExcludedPost(postText) {
  return STOP_WORDS.some((word) => postText.toLowerCase().includes(word));
}

function isRecentPost(postText) {
  const match = postText.match(/(\d{1,2} [A-Za-z]+ \d{4})/);
  if (!match) return false;
  const postDate = new Date(match[1]);
  const now = new Date();
  const diffDays = (now - postDate) / (1000 * 60 * 60 * 24);
  return diffDays <= 7;
}

function rankPosts(posts) {
  return posts.sort((a, b) => {
    const aScore = a.reactions + a.comments;
    const bScore = b.reactions + b.comments;
    return bScore - aScore;
  });
}

async function getPostUrl(page, postElement) {
  try {
    const threeDotsSelectors = [
      'button[aria-label*="Open control menu for post"]',
      'button[aria-label*="More actions"]',
      'button[aria-label*="More"]',
      'button[data-control-name*="more_actions"]',
      '.feed-shared-control-menu__trigger',
    ];

    let threeDotsButton = null;
    for (const selector of threeDotsSelectors) {
      threeDotsButton = await postElement.$(selector);
      if (threeDotsButton) {
        console.log(`Found three dots button with selector: ${selector}`);
        break;
      }
    }

    if (!threeDotsButton) {
      console.log('Three dots button not found for post');
      return null;
    }

    await threeDotsButton.click();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const copyLinkSelectors = [
      'li.feed-shared-control-menu__item h5.feed-shared-control-menu__headline.t-14.t-black.t-bold',
      'li.feed-shared-control-menu__item',
      'button[aria-label*="Copy link"]',
      'div[role="button"]:has-text("Copy link")',
    ];

    let copyLinkOption = null;
    for (const selector of copyLinkSelectors) {
      const elements = await page.$$(selector);
      for (const el of elements) {
        const text = await page.evaluate((el) => el.textContent.trim(), el);
        console.log(`Menu option found: "${text}"`);
        if (text.includes('Copy link') || text.includes('Copy link to post')) {
          copyLinkOption = el;
          break;
        }
      }
      if (copyLinkOption) break;
    }

    if (!copyLinkOption) {
      console.log('Copy link option not found in menu');
      return null;
    }

    const clickableElement = await copyLinkOption.evaluateHandle((el) =>
      el.closest('div[role="button"]')
    );
    if (clickableElement) {
      await clickableElement.click();
    } else {
      console.log('Clickable element not found');
      return null;
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const toast = await page.$(
      '.artdeco-toast-item--visible, .artdeco-toast-item'
    );
    if (!toast) {
      console.log('Toast notification not found');
      return null;
    }

    let linkElement = await toast.$('a[href*="linkedin.com"]');
    if (!linkElement) {
      linkElement = await toast.$('a');
    }
    if (!linkElement) {
      console.log('Link not found in toast');
      return null;
    }

    const postUrl = await page.evaluate((el) => el.href, linkElement);
    console.log(`Successfully extracted post URL: ${postUrl}`);

    const dismissButton = await toast.$('button[aria-label*="Dismiss"]');
    if (dismissButton) {
      await dismissButton.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return postUrl;
  } catch (error) {
    console.log(`Error getting post URL: ${error.message}`);
    return null;
  }
}

async function generateAIComment(postContent) {
  try {
    const emojiInstruction = AI_CONFIG.wantEmoji
      ? 'Include 1-2 relevant emojis'
      : 'Do not include any emojis';
    const hashtagInstruction = AI_CONFIG.wantHashtags
      ? 'Include 2-3 relevant hashtags'
      : 'Do not include hashtags';
    const toneInstruction = `Use a ${AI_CONFIG.messageTone} tone`;
    const lengthInstruction = `Keep the comment to maximum ${AI_CONFIG.maxLength} words`;

    const prompt = `You are a professional LinkedIn user who engages thoughtfully with posts. 
    
    Generate a natural, engaging comment for this LinkedIn post. The comment should:
    - Be authentic and conversational (not robotic)
    - Show genuine interest in the topic
    - ${lengthInstruction}
    - Avoid generic responses like "Great post!" or "Thanks for sharing!"
    - Add value or insight when possible
    - ${toneInstruction}
    - ${emojiInstruction}
    - ${hashtagInstruction}
    
    Post content: "${postContent}"
    
    Generate only the comment text (no explanations):`;

    const response = await makeRequest(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content:
              'You are a professional LinkedIn user who creates engaging, authentic comments.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 100,
        temperature: 0.7,
        top_p: 0.9,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    const generatedComment = data.choices[0].message.content.trim();

    console.log(`AI generated comment: "${generatedComment}"`);
    return generatedComment;
  } catch (error) {
    console.log(`Error generating AI comment: ${error.message}`);
    return COMMENT_TEXT;
  }
}

async function generateAdvancedAIComment(
  postContent,
  postReactions,
  postComments
) {
  try {
    const isHighEngagement = postReactions > 50 || postComments > 10;
    const isLowEngagement = postReactions < 10 && postComments < 3;

    let engagementContext = '';
    if (isHighEngagement) {
      engagementContext =
        'This post has high engagement, so your comment should be thoughtful and add value to stand out.';
    } else if (isLowEngagement) {
      engagementContext =
        'This post has low engagement, so your comment should be encouraging and supportive.';
    }

    const emojiInstruction = AI_CONFIG.wantEmoji
      ? 'Include 1-2 relevant emojis'
      : 'Do not include any emojis';
    const hashtagInstruction = AI_CONFIG.wantHashtags
      ? 'Include 2-3 relevant hashtags'
      : 'Do not include hashtags';
    const toneInstruction = `Use a ${AI_CONFIG.messageTone} tone`;
    const lengthInstruction = `Keep the comment to maximum ${AI_CONFIG.maxLength} words`;

    const prompt = `You are a professional LinkedIn user who creates engaging comments.

    CONTEXT:
    - Post content: "${postContent}"
    - Reactions: ${postReactions}
    - Comments: ${postComments}
    ${engagementContext}

    COMMENT REQUIREMENTS:
    - Be authentic and conversational
    - ${lengthInstruction}
    - Add value or insight when possible
    - ${toneInstruction}
    - ${emojiInstruction}
    - ${hashtagInstruction}
    - Avoid generic responses
    - Match the post's tone and topic

    Generate only the comment text:`;

    log('Making OpenAI API request...');
    log(`OpenAI API Key available: ${!!OPENAI_API_KEY}`);
    log(`OpenAI API Key length: ${OPENAI_API_KEY ? OPENAI_API_KEY.length : 0}`);

    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }

    const response = await makeRequest(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content:
              'You are a professional LinkedIn user who creates engaging, authentic comments based on post context and engagement levels.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 120,
        temperature: 0.8,
        top_p: 0.9,
      }),
    });

    console.log(`API Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`API Error response: ${errorText}`);
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = await response.json();
    console.log('API Response data:', JSON.stringify(data, null, 2));

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response format from OpenAI API');
    }

    const generatedComment = data.choices[0].message.content.trim();

    console.log(`Advanced AI comment generated: "${generatedComment}"`);
    return generatedComment;
  } catch (error) {
    console.log(`Error generating advanced AI comment: ${error.message}`);
    return COMMENT_TEXT;
  }
}

async function waitForSchedule(scheduledTime) {
  if (scheduledTime && !isNaN(scheduledTime.getTime())) {
    const now = new Date();
    const diff = scheduledTime - now;
    if (diff > 0) {
      console.log(
        `Scheduling enabled. Waiting until ${scheduledTime.toLocaleString()} to start...`
      );
      await new Promise((res) => setTimeout(res, diff));
      console.log('Scheduled time reached. Starting the script...');
    } else {
      console.log('Scheduled time is in the past. Starting immediately.');
    }
  }
}

// Remove the immediate execution at the end and wrap in worker function
const worker = new Worker(
  'comment-jobs',
  async (job) => {
    let browser = null;
    let cleanup = null;
    const { jobId, userId, keywords, maxComments, options } = job.data;

    console.log(
      `Processing comment job ${jobId} with linkedPostRefinementWorker`
    );
    console.log(`Job data:`, { jobId, userId, keywords, maxComments, options });

    // Update job status to active
    const CommentJob = (await import('../models/CommentJob.js')).default;

    // Check if job is already being processed
    const existingJob = await CommentJob.findById(jobId);
    if (existingJob && existingJob.status === 'active') {
      log(`Job ${jobId} is already being processed, skipping...`);
      return { success: false, reason: 'Job already being processed' };
    }

    // Check if job was recently completed to avoid rapid restarts
    if (
      existingJob &&
      existingJob.status === 'completed' &&
      existingJob.completedAt
    ) {
      const timeSinceCompletion =
        Date.now() - existingJob.completedAt.getTime();
      const minRestartInterval = 5 * 60 * 1000; // 5 minutes

      if (timeSinceCompletion < minRestartInterval) {
        log(
          `Job ${jobId} was completed recently (${Math.round(
            timeSinceCompletion / 1000
          )}s ago), skipping restart...`
        );
        return { success: false, reason: 'Job completed recently' };
      }
    }

    // Check for too many failed attempts
    if (existingJob && existingJob.status === 'failed') {
      const failedAttempts = existingJob.failedAttempts || 0;
      if (failedAttempts >= 3) {
        log(
          `Job ${jobId} has failed ${failedAttempts} times, marking as permanently failed`
        );
        await CommentJob.findByIdAndUpdate(jobId, {
          status: 'permanently_failed',
          error: 'Job failed too many times',
          completedAt: new Date(),
        });
        return { success: false, reason: 'Too many failed attempts' };
      }
    }

    await CommentJob.findByIdAndUpdate(jobId, {
      status: 'active',
      startedAt: new Date(),
      'progress.currentStep': 'Starting',
      'progress.stepProgress': 10,
    });

    try {
      // Record start time for session report
      const startTime = Date.now();

      // Use the existing logic but adapt it for the job data
      const TARGET_KEYWORDS = keywords || ['Startup', 'AI'];
      const MAX_COMMENTS = maxComments || 5;

      // Update progress
      await job.updateProgress(20);
      await CommentJob.findByIdAndUpdate(jobId, {
        'progress.currentStep': 'Loading Configuration',
        'progress.stepProgress': 20,
      });

      // Update progress
      await job.updateProgress(30);
      await CommentJob.findByIdAndUpdate(jobId, {
        'progress.currentStep': 'Launching Browser',
        'progress.stepProgress': 30,
      });

      // Launch browser with anti-detection measures and user data directory
      const userDataDir = path.join(__dirname, 'browser-data');
      browser = await puppeteer.launch({
        headless: process.env.NODE_ENV === 'production',
        defaultViewport: null,
        userDataDir: userDataDir, // Persist session data
        args: [
          '--start-maximized',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--disable-blink-features=AutomationControlled',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ],
      });

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(60000);

      // Set user agent and viewport
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      await page.setViewport({ width: 1920, height: 1080 });

      // Add extra headers to appear more human-like
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      });

      // Remove webdriver property to avoid detection
      await page.evaluateOnNewDocument(() => {
        delete navigator.__proto__.webdriver;
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
      });

      // Ensure browser is closed on any error
      cleanup = async () => {
        try {
          if (browser) {
            await browser.close();
            console.log('Browser closed successfully');
          }
        } catch (error) {
          console.error('Error closing browser:', error.message);
        }
      };

      // Load cookies from JSON file (same as working script)
      const COOKIE_PATH = path.join(__dirname, 'linkedin_cookies.json');
      let isLoggedIn = false;

      async function checkLoginStatus() {
        try {
          log('Checking login status...');
          const currentUrl = page.url();
          log(`Current URL: ${currentUrl}`);

          if (currentUrl.includes('/login') || currentUrl.includes('/signup')) {
            log('Detected login/signup page - not logged in');
            return false;
          }

          if (currentUrl.includes('/feed')) {
            log('Already on feed page, checking for feed elements...');
            const feedElement = await page.$(
              '.feed-shared-update-v2, .feed-identity-module'
            );
            const isLoggedIn = !!feedElement;
            log(`Feed element found: ${isLoggedIn}`);
            return isLoggedIn;
          }

          log('Navigating to feed page to check login status...');
          await page.goto('https://www.linkedin.com/feed/', {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
          });

          const newUrl = page.url();
          log(`After navigation, URL: ${newUrl}`);

          if (newUrl.includes('/login') || newUrl.includes('/signup')) {
            log('Redirected to login/signup page - not logged in');
            return false;
          }

          // Wait a bit for page to fully load
          await page.waitForTimeout(3000);

          const feedElement = await page.$(
            '.feed-shared-update-v2, .feed-identity-module'
          );
          const isLoggedIn = !!feedElement;
          log(`Feed element found after navigation: ${isLoggedIn}`);
          return isLoggedIn;
        } catch (error) {
          log(`Error checking login status: ${error.message}`);
          return false;
        }
      }

      if (fs.existsSync(COOKIE_PATH)) {
        try {
          log('Loading cookies from file...');
          const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH));
          const liAtCookie = cookies.find((c) => c.name === 'li_at');

          if (liAtCookie) {
            log('Found li_at cookie, setting it...');
            await page.setCookie({
              name: 'li_at',
              value: liAtCookie.value,
              domain: '.www.linkedin.com',
              path: '/',
              expires: -1,
              httpOnly: true,
              secure: true,
              session: true,
            });
            log('Loaded li_at cookie for login.');

            // Check login status
            isLoggedIn = await checkLoginStatus();
            if (!isLoggedIn) {
              log('li_at cookie is invalid/expired. Please update cookies.');
              throw new Error(
                'LinkedIn cookies are invalid or expired. Please update cookies.'
              );
            } else {
              log('Login successful with li_at cookie.');
            }
          } else {
            log('li_at cookie not found in file. Please update cookies.');
            throw new Error(
              'LinkedIn cookies are invalid or expired. Please update cookies.'
            );
          }
        } catch (error) {
          log(`Error loading cookies: ${error.message}`);
          throw new Error(
            'LinkedIn cookies are invalid or expired. Please update cookies.'
          );
        }
      } else {
        log('No cookie file found. Please update cookies.');
        throw new Error(
          'LinkedIn cookies are invalid or expired. Please update cookies.'
        );
      }

      // Update progress
      await job.updateProgress(40);
      await CommentJob.findByIdAndUpdate(jobId, {
        'progress.currentStep': 'Scraping Posts',
        'progress.stepProgress': 40,
      });

      // Use the existing scraping logic but adapt for job data
      const scrapedPosts = [];
      const SCRAPE_TARGET = Math.ceil(maxComments * 1.5); // 50% more than needed
      let totalScraped = 0;

      // Check for existing posts to avoid duplicates (user-specific)
      const Post = (await import('../models/Post.js')).default;
      const existingPostUrls = await Post.find({ jobId, userId }).distinct(
        'postUrl'
      );
      log(
        `Found ${existingPostUrls.length} existing posts for this job and user`
      );

      for (const keyword of TARGET_KEYWORDS) {
        if (totalScraped >= SCRAPE_TARGET) break;
        console.log(`Searching posts for keyword: ${keyword}`);

        const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(
          keyword
        )}`;

        try {
          log(`Navigating to search URL for keyword: ${keyword}`);
          await page.goto(searchUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 60000, // Increased timeout
          });

          // Add random delay to appear more human-like
          const randomDelay = Math.floor(Math.random() * 3000) + 2000; // 2-5 seconds
          log(`Waiting ${randomDelay}ms before scrolling...`);
          await page.waitForTimeout(randomDelay);

          // Wait for posts to load and scroll to get more
          let previousHeight = 0;
          let maxScrolls = 15;
          let scrollCount = 0;
          let stagnantScrolls = 0;
          let maxStagnant = 3;

          while (scrollCount < maxScrolls && stagnantScrolls < maxStagnant) {
            const postsCount = await page.evaluate(
              () => document.querySelectorAll('.feed-shared-update-v2').length
            );

            if (postsCount === previousHeight) {
              stagnantScrolls++;
            } else {
              stagnantScrolls = 0;
            }

            previousHeight = postsCount;
            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            await new Promise((res) => setTimeout(res, 10000));
            scrollCount++;
          }

          // Extract posts
          const postElements = await page.$$('.feed-shared-update-v2');

          for (let i = 0; i < postElements.length; i++) {
            if (totalScraped >= SCRAPE_TARGET) break;
            const postElement = postElements[i];

            try {
              const isAttached = await page.evaluate(
                (el) => document.contains(el),
                postElement
              );
              if (!isAttached) continue;

              const postData = await page.evaluate((el) => {
                const contentEl = el.querySelector('.update-components-text');
                const content = contentEl ? contentEl.innerText : '';

                let reactions = 0;
                const reactionsButton = el.querySelector(
                  'button[aria-label*="reactions"]'
                );
                if (reactionsButton) {
                  const match = reactionsButton
                    .getAttribute('aria-label')
                    .match(/([\d,]+)/);
                  if (match)
                    reactions = parseInt(match[1].replace(/,/g, ''), 10);
                }

                let comments = 0;
                const commentsButton = el.querySelector(
                  'button[aria-label*="comments"] span'
                );
                if (commentsButton) {
                  const match = commentsButton.innerText.match(/([\d,]+)/);
                  if (match)
                    comments = parseInt(match[1].replace(/,/g, ''), 10);
                }

                return { content: content.trim(), reactions, comments };
              }, postElement);

              if (isExcludedPost(postData.content)) continue;
              if (postData.reactions < 5) continue;

              const postUrl = await getPostUrl(page, postElement);
              if (postUrl) {
                // Skip if post URL already exists
                if (existingPostUrls.includes(postUrl)) {
                  log(
                    `Skipping duplicate post URL: ${postUrl.substring(
                      0,
                      50
                    )}...`
                  );
                  continue;
                }

                const postDataWithUrl = {
                  ...postData,
                  postUrl,
                  keyword,
                  scrapedAt: new Date().toISOString(),
                };
                scrapedPosts.push(postDataWithUrl);
                totalScraped++;
              }
            } catch (error) {
              console.log(`Error processing post ${i + 1}: ${error.message}`);
              continue;
            }
          }
        } catch (error) {
          console.error(
            `Error scraping posts for keyword "${keyword}":`,
            error
          );
          continue;
        }
      }

      // Update progress
      await job.updateProgress(60);
      await CommentJob.findByIdAndUpdate(jobId, {
        'progress.currentStep': 'Processing Posts',
        'progress.stepProgress': 60,
      });

      // Save scraped posts to database
      if (scrapedPosts.length > 0) {
        try {
          const postsToInsert = scrapedPosts.map((post) => ({
            ...post,
            jobId,
            userId,
            keywords,
            engagement: {
              reactions: post.reactions,
              comments: post.comments,
              engagementRate: ((post.reactions + post.comments) / 100) * 100,
            },
            metadata: {
              scrapedAt: post.scrapedAt,
              keyword: post.keyword,
            },
          }));

          // Use insertMany with ordered: false to continue on duplicate key errors
          const result = await Post.insertMany(postsToInsert, {
            ordered: false,
            rawResult: true,
          });

          log(
            `Successfully inserted ${result.insertedCount} posts, ${
              postsToInsert.length - result.insertedCount
            } were duplicates`
          );
        } catch (error) {
          if (error.code === 11000) {
            // Duplicate key error - some posts were inserted successfully
            log(`Some posts were duplicates, continuing with available posts`);
          } else {
            throw error;
          }
        }
      }

      // Use existing AI comment generation and posting logic
      let commentedCount = 0;

      // Get posts that haven't been commented on yet (user-specific)
      const commentedPostUrls = await Post.find({
        jobId,
        userId,
        isCommented: true,
      }).distinct('postUrl');

      log(
        `Found ${commentedPostUrls.length} already commented posts for this user`
      );

      // Rank posts and select top ones for commenting, excluding already commented ones
      const availablePosts = scrapedPosts.filter(
        (post) => !commentedPostUrls.includes(post.postUrl)
      );
      const rankedPosts = rankPosts(availablePosts);
      const postsForCommenting = rankedPosts.slice(0, maxComments);

      log(
        `Selected ${postsForCommenting.length} posts for commenting out of ${availablePosts.length} available posts`
      );

      console.log(
        `Starting auto-commenting on ${postsForCommenting.length} posts...`
      );

      for (const post of postsForCommenting) {
        try {
          if (!post.postUrl) {
            console.log('Post URL not found, skipping...');
            continue;
          }

          console.log('Generating AI comment for post...');
          console.log(`Post content: "${post.content.substring(0, 100)}..."`);

          let aiComment;
          try {
            aiComment = await generateAdvancedAIComment(
              post.content,
              post.reactions,
              post.comments
            );
            console.log(`AI generated comment: "${aiComment}"`);
          } catch (error) {
            console.log(`AI comment generation failed: ${error.message}`);
            console.log('Using fallback comment...');
            aiComment = COMMENT_TEXT;
          }

          console.log('Navigating to post to comment...');
          await page.goto(post.postUrl, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('button[aria-label*="Comment"]', {
            timeout: 10000,
          });

          const commentButton = await page.$('button[aria-label*="Comment"]');
          if (commentButton) {
            await commentButton.click();
            await page.waitForSelector(
              'div[role="textbox"][contenteditable="true"]',
              { timeout: 10000 }
            );

            const editor = await page.$(
              'div[role="textbox"][contenteditable="true"]'
            );
            await editor.focus();
            await page.keyboard.type(aiComment, { delay: 30 });

            await page.waitForSelector(
              '.comments-comment-box__submit-button--cr',
              {
                timeout: 5000,
              }
            );
            await page.click('.comments-comment-box__submit-button--cr');

            console.log('Comment submitted successfully.');
            commentedCount++;

            // Mark post as commented in database (user-specific)
            await Post.findOneAndUpdate(
              { postUrl: post.postUrl, jobId, userId },
              { isCommented: true, commentedAt: new Date() }
            );
          } else {
            console.log('Comment button not found.');
          }

          console.log('Waiting before next comment...');
          await new Promise((res) => setTimeout(res, 60000));
        } catch (err) {
          console.log('Failed to comment:', err.message);
        }
      }

      // Update progress
      await job.updateProgress(90);
      await CommentJob.findByIdAndUpdate(jobId, {
        'progress.currentStep': 'Finalizing',
        'progress.stepProgress': 90,
      });

      // Create session report
      const SessionReport = (await import('../models/SessionReport.js'))
        .default;
      const endTime = Date.now();
      const sessionReport = await SessionReport.create({
        jobId,
        userId,
        totalPostsScraped: scrapedPosts.length,
        filteredPosts: postsForCommenting.length,
        commentsPosted: commentedCount,
        failed: postsForCommenting.length - commentedCount,
        duration: endTime - startTime,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        successRate:
          scrapedPosts.length > 0
            ? (commentedCount / scrapedPosts.length) * 100
            : 0,
        keywords,
        targetKeywords: keywords,
      });

      // Update job with results
      await CommentJob.findByIdAndUpdate(jobId, {
        status: 'completed',
        completedAt: new Date(),
        result: {
          success: true,
          commentedCount,
          totalPostsScraped: scrapedPosts.length,
          sessionReport: {
            totalPostsScraped: scrapedPosts.length,
            filteredPosts: postsForCommenting.length,
            commentsPosted: commentedCount,
            failed: postsForCommenting.length - commentedCount,
          },
        },
        'progress.currentStep': 'Completed',
        'progress.stepProgress': 100,
      });

      // Update progress
      await job.updateProgress(100);

      console.log(
        `LinkedPostRefinement job ${jobId} completed successfully. ${commentedCount} comments posted.`
      );

      // Clean up browser
      try {
        if (cleanup && typeof cleanup === 'function') {
          await cleanup();
        }
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError.message);
      }

      return {
        success: true,
        commentedCount,
        totalPostsScraped: scrapedPosts.length,
        sessionReport: sessionReport._id,
      };
    } catch (error) {
      console.error(`LinkedPostRefinement job ${jobId} failed:`, error);

      // Clean up browser on error
      try {
        if (cleanup && typeof cleanup === 'function') {
          await cleanup();
        }
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError.message);
      }

      // Update job status to failed
      const CommentJob = (await import('../models/CommentJob.js')).default;
      const failedAttempts = (existingJob?.failedAttempts || 0) + 1;
      await CommentJob.findByIdAndUpdate(jobId, {
        status: 'failed',
        error: error.message,
        failedAttempts,
        completedAt: new Date(),
        'progress.currentStep': 'Failed',
        'progress.stepProgress': 0,
      });

      // Create error session report
      const SessionReport = (await import('../models/SessionReport.js'))
        .default;
      await SessionReport.create({
        jobId,
        userId,
        totalPostsScraped: 0,
        filteredPosts: 0,
        commentsPosted: 0,
        failed: 1,
        duration: 0,
        startTime: new Date(),
        endTime: new Date(),
        successRate: 0,
        keywords,
        targetKeywords: keywords,
        errors: [
          {
            message: error.message,
            step: 'Job execution',
            timestamp: new Date(),
          },
        ],
      });

      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 1,
    settings: {
      maxStalledCount: 1,
      stalledInterval: 30000,
      lockDuration: 300000, // 5 minutes lock duration
      lockRenewTime: 150000, // Renew lock every 2.5 minutes
    },
  }
);

// Worker event handlers
worker.on('completed', (job) => {
  console.log(`LinkedPostRefinement worker completed job ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(
    `LinkedPostRefinement worker failed job ${job.id}:`,
    err.message
  );
});

worker.on('error', (err) => {
  console.error('LinkedPostRefinement worker error:', err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log(
    'LinkedPostRefinement worker received SIGTERM, shutting down gracefully...'
  );
  await worker.close();
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log(
    'LinkedPostRefinement worker received SIGINT, shutting down gracefully...'
  );
  await worker.close();
  await redis.quit();
  process.exit(0);
});

// Handle uncaught exceptions to prevent zombie processes
process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  try {
    await worker.close();
    await redis.quit();
  } catch (cleanupError) {
    console.error('Error during emergency cleanup:', cleanupError);
  }
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  try {
    await worker.close();
    await redis.quit();
  } catch (cleanupError) {
    console.error('Error during emergency cleanup:', cleanupError);
  }
  process.exit(1);
});

console.log('LinkedPostRefinement worker started successfully');
console.log(`Log file location: ${logFile}`);
console.log(`Browser data directory: ${path.join(__dirname, 'browser-data')}`);

export default worker;
