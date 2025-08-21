import rateLimiterService from '../services/rateLimiter.js';

export const apiRateLimiter = async (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const result = await rateLimiterService.checkApiLimit(ip);

  if (!result.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Too many requests',
      retryAfter: result.retryAfter,
    });
  }

  next();
};

export const jobRateLimiter = async (req, res, next) => {
  const userId = req.userId; // From auth middleware
  const result = await rateLimiterService.checkJobLimit(userId);

  if (!result.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Job creation limit exceeded',
      retryAfter: result.retryAfter,
      message: `You can create ${result.remainingPoints} more jobs after ${result.retryAfter} seconds`,
    });
  }

  next();
};
