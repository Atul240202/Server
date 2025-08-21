import { RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';

class RateLimiterService {
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
    });

    this.initializeLimiters();
  }

  initializeLimiters() {
    // API rate limiter - per IP
    this.apiLimiter = new RateLimiterRedis({
      storeClient: this.redis,
      keyPrefix: 'rl:api',
      points: 100, // requests
      duration: 60, // per minute
      blockDuration: 60, // block for 1 minute
    });

    // Job creation limiter - per user
    this.jobLimiter = new RateLimiterRedis({
      storeClient: this.redis,
      keyPrefix: 'rl:job',
      points: 10, // jobs
      duration: 3600, // per hour
      blockDuration: 3600, // block for 1 hour
    });

    // LinkedIn action limiter - per user
    this.linkedinLimiter = new RateLimiterRedis({
      storeClient: this.redis,
      keyPrefix: 'rl:linkedin',
      points: 50, // actions
      duration: 3600, // per hour
      blockDuration: 7200, // block for 2 hours
    });

    // Comment limiter - per user
    this.commentLimiter = new RateLimiterRedis({
      storeClient: this.redis,
      keyPrefix: 'rl:comment',
      points: 5, // comments
      duration: 3600, // per hour
      blockDuration: 3600, // block for 1 hour
    });
  }

  async checkApiLimit(ip) {
    try {
      await this.apiLimiter.consume(ip);
      return { allowed: true };
    } catch (rejRes) {
      return {
        allowed: false,
        retryAfter: Math.round(rejRes.msBeforeNext / 1000) || 60,
      };
    }
  }

  async checkJobLimit(userId) {
    try {
      await this.jobLimiter.consume(userId);
      return { allowed: true };
    } catch (rejRes) {
      return {
        allowed: false,
        retryAfter: Math.round(rejRes.msBeforeNext / 1000) || 3600,
        remainingPoints: rejRes.remainingPoints || 0,
      };
    }
  }

  async checkLinkedInLimit(userId) {
    try {
      const res = await this.linkedinLimiter.consume(userId);
      return {
        allowed: true,
        remaining: res.remainingPoints,
        resetAt: new Date(Date.now() + res.msBeforeNext),
      };
    } catch (rejRes) {
      return {
        allowed: false,
        retryAfter: Math.round(rejRes.msBeforeNext / 1000) || 7200,
      };
    }
  }

  async checkCommentLimit(userId) {
    try {
      await this.commentLimiter.consume(userId);
      return { allowed: true };
    } catch (rejRes) {
      return {
        allowed: false,
        retryAfter: Math.round(rejRes.msBeforeNext / 1000) || 3600,
      };
    }
  }

  // Get current limits status
  async getLimitsStatus(userId) {
    const [job, linkedin, comment] = await Promise.all([
      this.jobLimiter.get(userId),
      this.linkedinLimiter.get(userId),
      this.commentLimiter.get(userId),
    ]);

    return {
      jobs: {
        used: job ? job.consumedPoints : 0,
        remaining: job ? job.remainingPoints : 10,
        resetAt: job ? new Date(Date.now() + job.msBeforeNext) : null,
      },
      linkedinActions: {
        used: linkedin ? linkedin.consumedPoints : 0,
        remaining: linkedin ? linkedin.remainingPoints : 50,
        resetAt: linkedin ? new Date(Date.now() + linkedin.msBeforeNext) : null,
      },
      comments: {
        used: comment ? comment.consumedPoints : 0,
        remaining: comment ? comment.remainingPoints : 5,
        resetAt: comment ? new Date(Date.now() + comment.msBeforeNext) : null,
      },
    };
  }
}

export default new RateLimiterService();
