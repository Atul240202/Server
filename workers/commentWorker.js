import { Worker } from 'bullmq';
import Redis from 'ioredis';
import puppeteer from 'puppeteer';
import { hasValidLinkedInCookies } from '../utils/cookieLoader.js';
import { generateAIComment } from '../utils/aiCommentGenerator.js';
import { filterPosts } from '../utils/postFilters.js';
import CommentJob from '../models/CommentJob.js';
import Post from '../models/Post.js';
import SessionReport from '../models/SessionReport.js';

// Redis connection - Fixed configuration
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: null, // BullMQ requirement
});

// Rate limiting configuration - More conservative to prevent 429/403 errors
const RATE_LIMITS = {
  NAVIGATION_DELAY: 20000, // 20 seconds between page navigations (increased)
  SCROLL_DELAY: 10000, // 10 seconds between scrolls (increased)
  POST_PROCESSING_DELAY: 8000, // 8 seconds between post processing (increased)
  COMMENT_DELAY: 45000, // 45 seconds between comments (increased)
  SEARCH_DELAY: 30000, // 30 seconds between searches (increased)
  MAX_REQUESTS_PER_MINUTE: 5, // Maximum requests per minute (reduced)
  MAX_REQUESTS_PER_HOUR: 50, // Maximum requests per hour (reduced)
};

// Rate limiting tracker
let requestCount = {
  minute: { count: 0, resetTime: Date.now() + 60000 },
  hour: { count: 0, resetTime: Date.now() + 3600000 },
};

// Helper function to check and update rate limits
function checkRateLimit() {
  const now = Date.now();

  // Reset minute counter if needed
  if (now > requestCount.minute.resetTime) {
    requestCount.minute = { count: 0, resetTime: now + 60000 };
  }

  // Reset hour counter if needed
  if (now > requestCount.hour.resetTime) {
    requestCount.hour = { count: 0, resetTime: now + 3600000 };
  }

  // Check limits
  if (requestCount.minute.count >= RATE_LIMITS.MAX_REQUESTS_PER_MINUTE) {
    const waitTime = requestCount.minute.resetTime - now;
    console.log(`Rate limit exceeded (minute). Waiting ${waitTime}ms`);
    return waitTime;
  }

  if (requestCount.hour.count >= RATE_LIMITS.MAX_REQUESTS_PER_HOUR) {
    const waitTime = requestCount.hour.resetTime - now;
    console.log(`Rate limit exceeded (hour). Waiting ${waitTime}ms`);
    return waitTime;
  }

  // Increment counters
  requestCount.minute.count++;
  requestCount.hour.count++;

  return 0;
}

// Helper function to wait with exponential backoff
async function waitWithBackoff(baseDelay, attempt, maxAttempts = 5) {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), 60000); // Max 60 seconds
  console.log(`Waiting ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

// Helper function to handle 429 errors with retry logic
async function handleRateLimitError(page, error, operation, maxRetries = 3) {
  if (
    error.message.includes('429') ||
    error.message.includes('Too Many Requests')
  ) {
    console.log(
      `Rate limit detected during ${operation}. Implementing backoff...`
    );

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const waitTime = (attempt + 1) * 30000; // 30s, 60s, 90s
      console.log(`Waiting ${waitTime}ms before retry ${attempt + 1}`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      try {
        // Refresh the page to clear any rate limit state
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        return true; // Successfully recovered
      } catch (retryError) {
        console.log(`Retry ${attempt + 1} failed: ${retryError.message}`);
        if (attempt === maxRetries - 1) {
          throw new Error(
            `Rate limit recovery failed after ${maxRetries} attempts`
          );
        }
      }
    }
  }
  return false; // Not a rate limit error
}

// Helper function to get post URL using the working method from linked_post_refinement.js
async function getPostUrl(page, postElement) {
  try {
    // Check rate limit before proceeding
    const waitTime = checkRateLimit();
    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

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
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Increased from 1500

    const copyLinkSelectors = [
      'button[aria-label*="Copy link"]',
      'li.feed-shared-control-menu__item h5.feed-shared-control-menu__headline.t-14.t-black.t-bold',
      'li.feed-shared-control-menu__item',
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

    await new Promise((resolve) => setTimeout(resolve, 4000)); // Increased from 3000

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
    let postUrl = null;
    if (linkElement) {
      postUrl = await page.evaluate((el) => el.href, linkElement);
    } else {
      console.log('Link not found in toast, trying clipboard fallback...');
      const copied = await page.evaluate(() =>
        navigator.clipboard.readText().catch(() => null)
      );
      if (copied && copied.includes('linkedin.com')) {
        postUrl = copied;
      }
    }

    if (!postUrl) {
      return null;
    }

    console.log(`Successfully extracted post URL: ${postUrl}`);

    const dismissButton = await toast.$('button[aria-label*="Dismiss"]');
    if (dismissButton) {
      await dismissButton.click();
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Increased from 500
    }

    return postUrl;
  } catch (error) {
    console.log(`Error getting post URL: ${error.message}`);
    return null;
  }
}

async function postCommentOnPost(page, postUrl, text) {
  try {
    // Check rate limit before navigation
    const waitTime = checkRateLimit();
    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // open the comment editor
    const openSelectors = [
      'button[aria-label^="Comment"]',
      'button[aria-label*="comment"]',
      'button.comments-comment-social-bar__reply-action', // fallback
    ];
    let opened = false;
    for (const sel of openSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        opened = true;
        break;
      }
    }
    if (!opened) throw new Error('Comment button not found');

    // focus composer
    await page.waitForSelector('div[role="textbox"][contenteditable="true"]', {
      timeout: 10000,
    });
    const editor = await page.$('div[role="textbox"][contenteditable="true"]');
    await editor.focus();
    await page.keyboard.type(text, { delay: 50 }); // Increased delay for typing

    // click submit (several UIs)
    const submitSelectors = ['.comments-comment-box__submit-button--cr'];
    for (const sel of submitSelectors) {
      const el = await page.$(sel).catch(() => null);
      if (el) {
        await el.click();
        return true;
      }
    }
    throw new Error('Submit button not found');
  } catch (error) {
    // Handle rate limit errors
    const isRateLimit = await handleRateLimitError(
      page,
      error,
      'posting comment'
    );
    if (isRateLimit) {
      throw new Error('Rate limit encountered while posting comment');
    }
    throw error;
  }
}

// Create worker with conservative settings
const worker = new Worker(
  'comment-jobs',
  async (job) => {
    const startTime = Date.now();
    const { jobId, userId, keywords, maxComments, options } = job.data;

    console.log(`Processing comment job ${jobId} for user ${userId}`);

    // Check if job is already being processed
    const existingJob = await CommentJob.findById(jobId);
    if (existingJob && existingJob.status === 'active') {
      console.log(`Job ${jobId} is already being processed. Skipping.`);
      return { success: false, message: 'Job already being processed' };
    }

    try {
      let browser = null; // Declare browser variable for error handling

      // Update job status to active
      await CommentJob.findByIdAndUpdate(jobId, {
        status: 'active',
        startedAt: new Date(),
        'progress.currentStep': 'Starting',
        'progress.stepProgress': 10,
      });

      // Check if user has valid LinkedIn cookies
      const hasValidCookies = await hasValidLinkedInCookies(userId);
      if (!hasValidCookies) {
        throw new Error('User does not have valid LinkedIn cookies');
      }

      console.log(
        `User ${userId} has valid LinkedIn cookies, proceeding with scraping`
      );

      // Update progress
      await job.updateProgress(20);
      await CommentJob.findByIdAndUpdate(jobId, {
        'progress.currentStep': 'Loading Cookies',
        'progress.stepProgress': 20,
      });

      // Load LinkedIn cookies
      const { loadLinkedInCookies } = await import('../utils/cookieLoader.js');
      const cookies = await loadLinkedInCookies(userId);

      // Update progress
      await job.updateProgress(30);
      await CommentJob.findByIdAndUpdate(jobId, {
        'progress.currentStep': 'Launching Browser',
        'progress.stepProgress': 30,
      });

      // Launch Puppeteer with LinkedIn compatibility (matching working script exactly)
      const isHeadless = process.env.NODE_ENV === 'production'; // Headless in production only
      browser = await puppeteer.launch({
        headless: isHeadless, // Headless only in production
        defaultViewport: null,
        args: ['--start-maximized'], // Simplified args to match working script
      });

      console.log(
        `Browser launched in ${isHeadless ? 'headless' : 'visible'} mode`
      );

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(60000); // Match working script timeout

      // Set stable language to keep selectors predictable
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

      // Set the li_at cookie (matching working script approach)
      const liAt = cookies.find((c) => c.name === 'li_at');
      if (!liAt) throw new Error('Missing li_at cookie');
      await page.setCookie(liAt);

      // Add login status check (matching working script exactly)
      let isLoggedIn = false;

      async function checkLoginStatus() {
        try {
          const urlNow = page.url();
          if (urlNow.includes('/login') || urlNow.includes('/signup'))
            return false;
          if (urlNow.includes('/feed')) {
            const feedEl = await page.$(
              '.feed-shared-update-v2, .feed-identity-module'
            );
            return !!feedEl;
          }
          // Only navigate if not already on feed; use 'domcontentloaded' + longer timeout
          await page.goto('https://www.linkedin.com/feed/', {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
          });

          if (page.url().includes('/login') || page.url().includes('/signup'))
            return false;
          const feedEl = await page.$(
            '.feed-shared-update-v2, .feed-identity-module'
          );
          return !!feedEl;
        } catch (error) {
          console.log(`Error checking login status: ${error.message}`);
          return false;
        }
      }

      // Check if cookies are still valid with better error handling
      try {
        isLoggedIn = await checkLoginStatus();
        if (!isLoggedIn) {
          console.log(
            'Cookies are invalid or expired. Cannot proceed with scraping.'
          );
          throw new Error(
            'LinkedIn cookies are invalid or expired. Please update cookies.'
          );
        } else {
          console.log('Login successful with saved cookies.');
        }
      } catch (loginError) {
        console.log(`Login check failed: ${loginError.message}`);

        // Try a more robust login check (matching working script)
        try {
          console.log('Attempting alternative login verification...');

          // Wait for any redirects to complete
          await new Promise((resolve) => setTimeout(resolve, 5000));

          // Check current URL
          const currentUrl = page.url();
          console.log(`Current URL: ${currentUrl}`);

          if (currentUrl.includes('/login') || currentUrl.includes('/signup')) {
            throw new Error('Currently on login/signup page');
          }

          // Try to find feed elements (matching working script selectors)
          const feedElements = await page.$$(
            '.feed-shared-update-v2, .feed-identity-module'
          );
          if (feedElements.length > 0) {
            console.log('Feed elements found - login appears successful');
            isLoggedIn = true;
          } else {
            // Try to navigate to feed as fallback
            await page.goto('https://www.linkedin.com/feed/', {
              waitUntil: 'domcontentloaded',
              timeout: 20000,
            });

            await new Promise((resolve) => setTimeout(resolve, 3000));

            if (
              !page.url().includes('/login') &&
              !page.url().includes('/signup')
            ) {
              const feedElementsAfterNav = await page.$$(
                '.feed-shared-update-v2, .feed-identity-module'
              );
              if (feedElementsAfterNav.length > 0) {
                console.log('Login successful after navigation');
                isLoggedIn = true;
              } else {
                throw new Error('No feed elements found after navigation');
              }
            } else {
              throw new Error('Redirected to login page after navigation');
            }
          }
        } catch (alternativeLoginError) {
          console.log(
            `Alternative login check failed: ${alternativeLoginError.message}`
          );
          throw new Error(
            'LinkedIn cookies are invalid or expired. Please update cookies.'
          );
        }
      }

      // Update progress
      await job.updateProgress(40);
      await CommentJob.findByIdAndUpdate(jobId, {
        'progress.currentStep': 'Scraping Posts',
        'progress.stepProgress': 40,
      });

      // Scrape LinkedIn posts using the working logic from linked_post_refinement.js
      const scrapedPosts = [];
      let totalPostsScraped = 0;
      const SCRAPE_TARGET = Math.ceil(maxComments * 1.5); // 50% more than needed

      for (const keyword of keywords) {
        if (totalPostsScraped >= SCRAPE_TARGET) break;
        console.log(`Searching posts for keyword: ${keyword}`);

        try {
          // Check rate limit before navigation
          const waitTime = checkRateLimit();
          if (waitTime > 0) {
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }

          // Navigate to LinkedIn search with better error handling
          const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(
            keyword
          )}`;

          console.log(`Navigating to search URL: ${searchUrl}`);

          try {
            await page.goto(searchUrl, {
              waitUntil: 'domcontentloaded', // Changed from networkidle2 for better reliability
              timeout: 45000, // Increased timeout
            });
          } catch (navigationError) {
            console.log(`Navigation error: ${navigationError.message}`);

            // Handle specific error types
            if (navigationError.message.includes('ERR_TOO_MANY_REDIRECTS')) {
              console.log(
                'Too many redirects detected. This usually indicates authentication issues.'
              );
              console.log('Skipping this keyword due to redirect loop.');
              continue;
            }

            // Handle rate limit errors
            const isRateLimit = await handleRateLimitError(
              page,
              navigationError,
              'search navigation'
            );
            if (isRateLimit) {
              console.log(
                'Rate limit detected during search navigation, skipping this keyword'
              );
              continue;
            }

            // Try alternative approach - go to feed first, then search
            console.log('Trying alternative navigation approach...');
            try {
              await page.goto('https://www.linkedin.com/feed/', {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
              });
              await new Promise((resolve) =>
                setTimeout(resolve, RATE_LIMITS.NAVIGATION_DELAY)
              );

              // Now navigate to search
              await page.goto(searchUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
              });
            } catch (alternativeError) {
              console.log(
                `Alternative navigation also failed: ${alternativeError.message}`
              );
              console.log('Skipping this keyword due to navigation issues.');
              continue;
            }
          }

          // Add delay between searches
          await new Promise((resolve) =>
            setTimeout(resolve, RATE_LIMITS.SEARCH_DELAY)
          );

          console.log(`Current URL after navigation: ${page.url()}`);

          // Check if we got redirected to login
          if (page.url().includes('/login') || page.url().includes('/signup')) {
            console.log(
              'Got redirected to login page. Cookies may be invalid.'
            );
            throw new Error(
              'LinkedIn redirected to login page. Cookies are invalid.'
            );
          }

          // Wait for search filters and apply Posts filter
          console.log('Waiting for search filters...');
          try {
            const filterSelectors = [
              '.search-reusables__primary-filter button',
              '.search-reusables__filter-pill-button',
              'button[aria-pressed="false"]',
              '.artdeco-pill--choice',
            ];

            let filterFound = false;
            for (const selector of filterSelectors) {
              try {
                await page.waitForSelector(selector, { timeout: 3000 });
                filterFound = true;
                console.log(`Found filter buttons with selector: ${selector}`);
                break;
              } catch (e) {
                continue;
              }
            }

            if (!filterFound) {
              console.log(
                'Search filters not found, trying to proceed without filters...'
              );
            }
          } catch (error) {
            console.log('Error waiting for search filters:', error.message);
          }

          // Apply Posts filter
          try {
            const filterButtonSelectors = [
              '.search-reusables__primary-filter button',
              '.search-reusables__filter-pill-button',
              'button[aria-pressed="false"]',
              '.artdeco-pill--choice',
            ];

            let postsFilterApplied = false;

            for (const selector of filterButtonSelectors) {
              try {
                const filterButtons = await page.$$(selector);
                console.log(
                  `Found ${filterButtons.length} filter buttons with selector: ${selector}`
                );

                for (const btn of filterButtons) {
                  const text = await page.evaluate(
                    (el) => el.innerText.trim(),
                    btn
                  );
                  console.log(`Filter button text: "${text}"`);

                  if (text.includes('Posts')) {
                    await btn.click();
                    console.log("'Posts' filter applied.");
                    postsFilterApplied = true;
                    break;
                  }
                }

                if (postsFilterApplied) break;
              } catch (e) {
                console.log(`Error with selector ${selector}:`, e.message);
                continue;
              }
            }

            if (!postsFilterApplied) {
              console.log(
                'Could not find or apply Posts filter, proceeding with all results...'
              );
            }
          } catch (error) {
            console.log(
              'Could not apply Posts filter, proceeding with all results...'
            );
          }

          // Wait for posts to load
          const initialPosts = await page.evaluate(
            () => document.querySelectorAll('.feed-shared-update-v2').length
          );
          console.log(`Initial posts found: ${initialPosts}`);

          let newPosts = initialPosts;
          let retries = 0;
          const maxRetries = 10;

          while (newPosts <= initialPosts && retries < maxRetries) {
            console.log(`Waiting for posts to load... Retry ${retries + 1}`);
            await new Promise((res) => setTimeout(res, 1500));
            newPosts = await page.evaluate(
              () => document.querySelectorAll('.feed-shared-update-v2').length
            );
            retries++;
          }

          // Scroll to load more posts with rate limiting
          console.log('Dynamically scrolling to load all posts...');
          let previousHeight = 0;
          let maxScrolls = 15; // Reduced from 20
          let scrollCount = 0;
          let stagnantScrolls = 0;
          let maxStagnant = 3;

          while (scrollCount < maxScrolls && stagnantScrolls < maxStagnant) {
            // Check rate limit before scrolling
            const waitTime = checkRateLimit();
            if (waitTime > 0) {
              await new Promise((resolve) => setTimeout(resolve, waitTime));
            }

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
            console.log(`Scrolled. Loaded posts: ${postsCount}`);

            // Use rate-limited delay
            await new Promise((res) =>
              setTimeout(res, RATE_LIMITS.SCROLL_DELAY)
            );

            scrollCount++;
          }

          // Extract posts using the working selectors from linked_post_refinement.js
          // Wait for posts to appear
          try {
            await page.waitForSelector('.feed-shared-update-v2', {
              timeout: 10000,
            });
          } catch (error) {
            console.log('No posts found with .feed-shared-update-v2 selector');
          }

          let postElements = await page.$$('.feed-shared-update-v2');
          console.log(`Processing ${postElements.length} posts...`);

          if (postElements.length === 0) {
            console.log(
              'No posts found on this page. Trying alternative selectors...'
            );
            // Try alternative selectors
            const alternativeSelectors = [
              'article[data-test-id="post"]',
              '.feed-shared-text',
              '[data-test-id="post-content"]',
            ];

            for (const selector of alternativeSelectors) {
              const altElements = await page.$$(selector);
              if (altElements.length > 0) {
                console.log(
                  `Found ${altElements.length} posts with selector: ${selector}`
                );
                // Use these elements instead
                postElements = altElements;
                break;
              }
            }
          }

          for (let i = 0; i < postElements.length; i++) {
            if (totalPostsScraped >= SCRAPE_TARGET) break;
            const postElement = postElements[i];
            console.log(`\n🔍 Processing post ${i + 1}/${postElements.length}`);

            try {
              const isAttached = await page.evaluate((el) => {
                return document.contains(el);
              }, postElement);

              if (!isAttached) {
                console.log(
                  `Post ${i + 1} is no longer attached to DOM, skipping...`
                );
                continue;
              }

              // Extract post data using the exact same logic as linked_post_refinement.js
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
                  if (match) {
                    reactions = parseInt(match[1].replace(/,/g, ''), 10);
                  }
                }

                let comments = 0;
                const commentsButton = el.querySelector(
                  'button[aria-label*="comments"] span'
                );
                if (commentsButton) {
                  const match = commentsButton.innerText.match(/([\d,]+)/);
                  if (match) {
                    comments = parseInt(match[1].replace(/,/g, ''), 10);
                  }
                }

                return { content: content.trim(), reactions, comments };
              }, postElement);

              // Apply filtering logic from linked_post_refinement.js
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

              const isExcludedPost = (postText) => {
                return STOP_WORDS.some((word) =>
                  postText.toLowerCase().includes(word)
                );
              };

              if (isExcludedPost(postData.content)) {
                console.log(`Skipping post ${i + 1} - contains stop words`);
                continue;
              }

              if (postData.reactions < 5) {
                console.log(
                  `Skipping post ${i + 1} - very low engagement (${
                    postData.reactions
                  } reactions)`
                );
                continue;
              }

              // Get post URL using the working method
              const postUrl = await getPostUrl(page, postElement);
              if (postUrl) {
                const postDataWithUrl = {
                  text: postData.content,
                  reactions: postData.reactions,
                  comments: postData.comments,
                  postUrl,
                  keyword,
                  scrapedAt: new Date().toISOString(),
                };
                scrapedPosts.push(postDataWithUrl);
                totalPostsScraped++;
                console.log(
                  `Post processed and added. Total scraped: ${totalPostsScraped}`
                );
              } else {
                console.log(`Could not get URL for post ${i + 1}`);
              }

              // Use rate-limited delay for post processing
              await new Promise((resolve) =>
                setTimeout(resolve, RATE_LIMITS.POST_PROCESSING_DELAY)
              );
            } catch (error) {
              console.log(`Error processing post ${i + 1}: ${error.message}`);

              // Handle rate limit errors during post processing
              if (
                error.message.includes('429') ||
                error.message.includes('Too Many Requests')
              ) {
                console.log(
                  'Rate limit detected during post processing, waiting before continuing...'
                );
                await new Promise((resolve) => setTimeout(resolve, 30000));
              }

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

      // Fallback: If not enough posts, scrape from main feed (same as linked_post_refinement.js)
      if (scrapedPosts.length < SCRAPE_TARGET) {
        console.log(
          'Not enough posts found for keywords. Switching to main feed...'
        );
        try {
          console.log('Navigating to main LinkedIn feed...');
          await page.goto('https://www.linkedin.com/feed/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });

          // Wait for feed to load
          await new Promise((resolve) =>
            setTimeout(resolve, RATE_LIMITS.NAVIGATION_DELAY)
          );

          console.log('Feed navigation completed. Starting feed scraping...');

          let previousHeight = 0;
          let maxScrolls = 30;
          let scrollCount = 0;
          let stagnantScrolls = 0;
          let maxStagnant = 5;

          while (
            scrapedPosts.length < SCRAPE_TARGET &&
            scrollCount < maxScrolls &&
            stagnantScrolls < maxStagnant
          ) {
            let postElements = await page.$$('.feed-shared-update-v2');

            // If no posts found, try alternative selectors
            if (postElements.length === 0) {
              const alternativeSelectors = [
                'article[data-test-id="post"]',
                '.feed-shared-text',
                '[data-test-id="post-content"]',
              ];

              for (const selector of alternativeSelectors) {
                const altElements = await page.$$(selector);
                if (altElements.length > 0) {
                  console.log(
                    `Found ${altElements.length} posts with selector: ${selector}`
                  );
                  postElements = altElements;
                  break;
                }
              }
            }

            for (let i = 0; i < postElements.length; i++) {
              if (scrapedPosts.length >= SCRAPE_TARGET) break;
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

                const isExcludedPost = (postText) => {
                  return STOP_WORDS.some((word) =>
                    postText.toLowerCase().includes(word)
                  );
                };

                if (isExcludedPost(postData.content)) continue;
                if (postData.reactions < 5) continue;

                const postUrl = await getPostUrl(page, postElement);
                if (postUrl) {
                  const postDataWithUrl = {
                    text: postData.content,
                    reactions: postData.reactions,
                    comments: postData.comments,
                    postUrl,
                    keyword: 'feed',
                    scrapedAt: new Date().toISOString(),
                  };
                  scrapedPosts.push(postDataWithUrl);
                  console.log(
                    `(Feed) Post processed and added. Total scraped: ${scrapedPosts.length}`
                  );
                }
              } catch (error) {
                continue;
              }
            }

            // Scroll with rate limiting
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
            await new Promise((res) =>
              setTimeout(res, RATE_LIMITS.SCROLL_DELAY)
            );
            scrollCount++;
          }

          if (scrapedPosts.length >= SCRAPE_TARGET) {
            console.log(
              'Fallback feed scraping complete. Enough posts scraped.'
            );
          } else {
            console.log(
              'Fallback feed scraping ended. Not enough posts, but max scrolls/stagnant reached.'
            );
          }
        } catch (err) {
          console.log('Error during fallback feed scraping:', err.message);
        }
      }

      // Update progress
      await job.updateProgress(60);
      await CommentJob.findByIdAndUpdate(jobId, {
        'progress.currentStep': 'Filtering Posts',
        'progress.stepProgress': 60,
      });

      // Filter posts based on criteria
      const filteredPosts = filterPosts(scrapedPosts, options);

      // Save scraped posts to database
      const postsToSave = scrapedPosts.map((post) => ({
        postUrl: post.postUrl,
        content: post.text,
        reactions: post.reactions,
        comments: post.comments,
        jobId: jobId,
        keywords: [post.keyword],
        engagement: {
          totalEngagement: post.reactions + post.comments,
          engagementRate:
            post.reactions > 0
              ? (
                  ((post.reactions + post.comments) / post.reactions) *
                  100
                ).toFixed(2)
              : 0,
        },
        metadata: {
          postType: 'content',
          hashtags: post.text.match(/#\w+/g) || [],
          mentions: post.text.match(/@\w+/g) || [],
        },
      }));

      await Post.insertMany(postsToSave);

      // Update progress
      await job.updateProgress(70);
      await CommentJob.findByIdAndUpdate(jobId, {
        'progress.currentStep': 'Generating Comments',
        'progress.stepProgress': 70,
      });

      // Generate AI comments and post them
      let commentedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < Math.min(filteredPosts.length, maxComments); i++) {
        try {
          const post = filteredPosts[i];

          // Generate AI comment
          const comment = await generateAIComment(post.text, options);

          // Post comment (simulated for now)
          await postCommentOnPost(page, post.postUrl, comment);

          // Update post as commented
          await Post.findOneAndUpdate(
            { postUrl: post.postUrl },
            {
              isCommented: true,
              commentedText: comment,
              commentedAt: new Date(),
            }
          );

          commentedCount++;

          // Add delay between comments to avoid rate limiting
          await new Promise((resolve) =>
            setTimeout(resolve, RATE_LIMITS.COMMENT_DELAY)
          );
        } catch (error) {
          console.error(`Error commenting on post ${i}:`, error);

          // Handle rate limit errors during commenting
          if (
            error.message.includes('429') ||
            error.message.includes('Too Many Requests') ||
            error.message.includes('Rate limit')
          ) {
            console.log(
              'Rate limit detected during commenting, waiting before continuing...'
            );
            await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait 1 minute
          }

          failedCount++;
        }
      }

      // Update progress
      await job.updateProgress(90);
      await CommentJob.findByIdAndUpdate(jobId, {
        'progress.currentStep': 'Finalizing',
        'progress.stepProgress': 90,
      });

      // Create session report
      const sessionReport = await SessionReport.create({
        jobId,
        userId,
        totalPostsScraped,
        filteredPosts: filteredPosts.length,
        commentsPosted: commentedCount,
        failed: failedCount,
        duration: Date.now() - startTime,
        startTime: new Date(startTime),
        endTime: new Date(),
        successRate:
          totalPostsScraped > 0
            ? (commentedCount / totalPostsScraped) * 100
            : 0,
        keywords,
        targetKeywords: keywords,
        performance: {
          scrapingTime: Date.now() - startTime,
          filteringTime: 0,
          commentingTime: 0,
          totalTime: Date.now() - startTime,
        },
      });

      // Update job with results
      await CommentJob.findByIdAndUpdate(jobId, {
        status: 'completed',
        completedAt: new Date(),
        result: {
          success: true,
          commentedCount,
          totalPostsScraped,
          sessionReport: {
            totalPostsScraped,
            filteredPosts: filteredPosts.length,
            commentsPosted: commentedCount,
            failed: failedCount,
          },
        },
        'progress.currentStep': 'Completed',
        'progress.stepProgress': 100,
      });

      // Update progress
      await job.updateProgress(100);

      // Clean up browser properly
      try {
        if (browser && typeof browser.close === 'function') {
          console.log('Closing browser...');
          await browser.close();
        }
      } catch (browserError) {
        console.log(`Error closing browser: ${browserError.message}`);
      }

      console.log(
        `Comment job ${jobId} completed successfully. ${commentedCount} comments posted.`
      );

      return {
        success: true,
        commentedCount,
        totalPostsScraped,
        sessionReport: sessionReport._id,
      };
    } catch (error) {
      console.error(`Comment job ${jobId} failed:`, error);

      // Update job status to failed
      await CommentJob.findByIdAndUpdate(jobId, {
        status: 'failed',
        error: error.message,
        completedAt: new Date(),
        'progress.currentStep': 'Failed',
        'progress.stepProgress': 0,
      });

      // Create error session report
      await SessionReport.create({
        jobId,
        userId,
        totalPostsScraped: 0,
        filteredPosts: 0,
        commentsPosted: 0,
        failed: 1,
        duration: Date.now() - startTime,
        startTime: new Date(startTime),
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

      // Clean up browser properly
      try {
        if (browser && typeof browser.close === 'function') {
          console.log('Closing browser due to error...');
          await browser.close();
        }
      } catch (browserError) {
        console.log(`Error closing browser: ${browserError.message}`);
      }

      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 1, // Process one job at a time to avoid LinkedIn rate limiting
    settings: {
      maxStalledCount: 1, // Prevent infinite retries
      stalledInterval: 30000, // Check for stalled jobs every 30 seconds
      maxStalledCount: 2, // Allow 2 stalled attempts before giving up
    },
  }
);

// Worker event handlers
worker.on('completed', (job) => {
  console.log(`Worker completed job ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`Worker failed job ${job.id}:`, err.message);
});

worker.on('error', (err) => {
  console.error('Worker error:', err);
});

worker.on('stalled', (jobId) => {
  console.warn(`Worker detected stalled job ${jobId}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Worker received SIGTERM, shutting down gracefully...');
  await worker.close();
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Worker received SIGINT, shutting down gracefully...');
  await worker.close();
  await redis.quit();
  process.exit(0);
});

console.log('Comment worker started successfully');

export default worker;
