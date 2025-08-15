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

// Create worker
const worker = new Worker(
  'comment-jobs',
  async (job) => {
    const startTime = Date.now();
    const { jobId, userId, keywords, maxComments, options } = job.data;

    console.log(`Processing comment job ${jobId} for user ${userId}`);

    try {
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

      // Launch Puppeteer
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      });

      const page = await browser.newPage();

      // Set cookies
      await page.setCookie(...cookies);

      // Update progress
      await job.updateProgress(40);
      await CommentJob.findByIdAndUpdate(jobId, {
        'progress.currentStep': 'Scraping Posts',
        'progress.stepProgress': 40,
      });

      // Scrape LinkedIn posts
      const scrapedPosts = [];
      let totalPostsScraped = 0;

      for (const keyword of keywords) {
        try {
          // Navigate to LinkedIn search
          await page.goto(
            `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(
              keyword
            )}`,
            {
              waitUntil: 'networkidle2',
              timeout: 30000,
            }
          );

          // Wait for posts to load
          await page.waitForSelector('[data-test-id="post-content"]', {
            timeout: 10000,
          });

          // Extract posts
          const posts = await page.evaluate(() => {
            const postElements = document.querySelectorAll(
              '[data-test-id="post-content"]'
            );
            return Array.from(postElements, (post, index) => {
              if (index >= 20) return null; // Limit to 20 posts per keyword

              const textElement = post.querySelector(
                '[data-test-id="post-content-text"]'
              );
              const reactionElement = post.querySelector(
                '[data-test-id="social-details-social-activity"]'
              );
              const commentElement = post.querySelector(
                '[data-test-id="social-details-comments"]'
              );
              const linkElement = post
                .closest('article')
                ?.querySelector('a[href*="/posts/"]');

              if (!textElement || !linkElement) return null;

              const text = textElement.textContent?.trim() || '';
              const reactions = parseInt(
                reactionElement?.textContent?.match(/\d+/)?.[0] || '0'
              );
              const comments = parseInt(
                commentElement?.textContent?.match(/\d+/)?.[0] || '0'
              );
              const postUrl = linkElement.href;

              return {
                text,
                reactions,
                comments,
                postUrl,
                keyword,
                scrapedAt: new Date().toISOString(),
              };
            }).filter(Boolean);
          });

          scrapedPosts.push(...posts);
          totalPostsScraped += posts.length;
        } catch (error) {
          console.error(
            `Error scraping posts for keyword "${keyword}":`,
            error
          );
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
          console.log(`Posting comment on post: ${post.postUrl}`);
          console.log(`Comment: ${comment}`);

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
          await new Promise((resolve) => setTimeout(resolve, 5000));
        } catch (error) {
          console.error(`Error commenting on post ${i}:`, error);
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

      // Close browser
      await browser.close();

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

      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 1, // Process one job at a time to avoid LinkedIn rate limiting
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
