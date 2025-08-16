import express from 'express';
import {
  addCommentJob,
  getQueueStats,
  cleanQueue,
  pauseQueue,
  resumeQueue,
} from '../queues/commentQueue.js';
import { hasValidLinkedInCookies } from '../utils/cookieLoader.js';
import {
  authenticateToken,
  requireLinkedInCookies,
} from '../middleware/auth.js';
import User from '../models/User.js';
import CommentJob from '../models/CommentJob.js';
import Post from '../models/Post.js';
import SessionReport from '../models/SessionReport.js';

const router = express.Router();

/**
 * POST /api/start-comment-job
 * Start a new comment job
 */
router.post(
  '/start-comment-job',
  authenticateToken,
  requireLinkedInCookies,
  async (req, res) => {
    try {
      const { keywords, maxComments = 5, options = {} } = req.body;

      // Validate required fields
      if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Keywords array is required and must not be empty',
        });
      }

      // Validate maxComments
      if (maxComments < 1 || maxComments > 20) {
        return res.status(400).json({
          success: false,
          error: 'maxComments must be between 1 and 20',
        });
      }

      // Create job in database
      const commentJob = await CommentJob.create({
        userId: req.userId,
        keywords,
        maxComments,
        options,
        status: 'waiting',
      });

      // Add job to queue
      const job = await addCommentJob({
        jobId: commentJob._id.toString(), // Convert ObjectId to string
        userId: req.userId,
        keywords,
        maxComments,
        options,
      });

      // Update job with queue job ID
      await CommentJob.findByIdAndUpdate(commentJob._id, {
        'progress.currentStep': 'Queued',
        'progress.stepProgress': 0,
        'progress.totalSteps': 5,
      });

      res.status(201).json({
        success: true,
        message: 'Comment job started successfully',
        data: {
          jobId: commentJob._id.toString(), // Convert ObjectId to string
          queueJobId: job.id,
          keywords,
          maxComments,
          options,
          status: 'waiting',
        },
      });
    } catch (error) {
      console.error('Error starting comment job:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to start comment job',
        details: error.message,
      });
    }
  }
);

/**
 * GET /api/comment-jobs/stats
 * Get queue statistics
 */
router.get('/comment-jobs/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await getQueueStats();
    res.json({
      success: true,
      message: 'Queue statistics retrieved successfully',
      data: stats,
    });
  } catch (error) {
    console.error('Error getting queue stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get queue statistics',
      details: error.message,
    });
  }
});

/**
 * GET /api/comment-jobs/history/:userId
 * Get comment job history for a user
 */
router.get(
  '/comment-jobs/history/:userId',
  authenticateToken,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 20, status, dateFilter } = req.query;

      // Verify user is requesting their own data or is admin
      if (req.userId !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }

      // Build query
      const query = { userId };
      if (status && status !== 'all') {
        query.status = status;
      }

      if (dateFilter && dateFilter !== 'all') {
        const now = new Date();
        let startDate;

        switch (dateFilter) {
          case 'today':
            startDate = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate()
            );
            break;
          case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          default:
            startDate = null;
        }

        if (startDate) {
          query.createdAt = { $gte: startDate };
        }
      }

      // Execute query with pagination
      const skip = (page - 1) * limit;
      const jobs = await CommentJob.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('userId', 'username email');

      const total = await CommentJob.countDocuments(query);

      res.json({
        success: true,
        message: 'Job history retrieved successfully',
        data: {
          jobs,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      console.error('Error getting job history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get job history',
        details: error.message,
      });
    }
  }
);

/**
 * GET /api/comment-jobs/:jobId
 * Get detailed information about a specific job
 */
router.get('/comment-jobs/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await CommentJob.findById(jobId).populate(
      'userId',
      'username email'
    );

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
      });
    }

    // Verify user owns this job or is admin
    if (job.userId.toString() !== req.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    // Get related posts and session report
    const posts = await Post.find({ jobId }).sort({ scrapedAt: -1 });
    const sessionReport = await SessionReport.findOne({ jobId });

    res.json({
      success: true,
      message: 'Job details retrieved successfully',
      data: {
        job,
        posts,
        sessionReport,
      },
    });
  } catch (error) {
    console.error('Error getting job details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job details',
      details: error.message,
    });
  }
});

/**
 * PUT /api/comment-jobs/:jobId/status
 * Update job status (admin only)
 */
router.put(
  '/api/comment-jobs/:jobId/status',
  authenticateToken,
  async (req, res) => {
    try {
      const { jobId } = req.params;
      const { status, progress } = req.body;

      // Only allow status updates from workers or admins
      if (req.user.role !== 'admin' && !req.user.isWorker) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }

      const updateData = {};
      if (status) updateData.status = status;
      if (progress) updateData.progress = progress;

      if (status === 'active') {
        updateData.startedAt = new Date();
      } else if (status === 'completed' || status === 'failed') {
        updateData.completedAt = new Date();
      }

      const job = await CommentJob.findByIdAndUpdate(jobId, updateData, {
        new: true,
      });

      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
        });
      }

      res.json({
        success: true,
        message: 'Job status updated successfully',
        data: job,
      });
    } catch (error) {
      console.error('Error updating job status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update job status',
        details: error.message,
      });
    }
  }
);

/**
 * POST /api/comment-jobs/clean
 * Clean completed and failed jobs
 */
router.post('/comment-jobs/clean', authenticateToken, async (req, res) => {
  try {
    // Only allow admins to clean queue
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin role required.',
      });
    }

    await cleanQueue();
    res.json({
      success: true,
      message: 'Queue cleaned successfully',
    });
  } catch (error) {
    console.error('Error cleaning queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clean queue',
      details: error.message,
    });
  }
});

/**
 * POST /api/comment-jobs/pause
 * Pause the queue
 */
router.post('/comment-jobs/pause', authenticateToken, async (req, res) => {
  try {
    // Only allow admins to pause queue
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin role required.',
      });
    }

    await pauseQueue();
    res.json({
      success: true,
      message: 'Queue paused successfully',
    });
  } catch (error) {
    console.error('Error pausing queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to pause queue',
      details: error.message,
    });
  }
});

/**
 * POST /api/comment-jobs/resume
 * Resume the queue
 */
router.post('/comment-jobs/resume', authenticateToken, async (req, res) => {
  try {
    // Only allow admins to resume queue
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin role required.',
      });
    }

    await resumeQueue();
    res.json({
      success: true,
      message: 'Queue resumed successfully',
    });
  } catch (error) {
    console.error('Error resuming queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resume queue',
      details: error.message,
    });
  }
});

/**
 * GET /api/comment-jobs/user/:userId
 * Get comment jobs for a specific user
 */
router.get(
  '/comment-jobs/user/:userId',
  authenticateToken,
  async (req, res) => {
    try {
      const { userId } = req.params;

      // Check if user exists
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      // Check if user has valid LinkedIn cookies
      const hasValidCookies = await hasValidLinkedInCookies(userId);

      // Get user's job statistics
      const jobStats = await CommentJob.aggregate([
        { $match: { userId: user._id } },
        {
          $group: {
            _id: null,
            totalJobs: { $sum: 1 },
            completedJobs: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            failedJobs: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
            },
            activeJobs: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
            },
          },
        },
      ]);

      const stats = jobStats[0] || {
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        activeJobs: 0,
      };

      res.json({
        success: true,
        message: 'User comment job info retrieved successfully',
        data: {
          userId,
          hasValidCookies,
          canStartJob: hasValidCookies,
          jobStatistics: stats,
        },
      });
    } catch (error) {
      console.error('Error getting user comment job info:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get user comment job info',
        details: error.message,
      });
    }
  }
);

export default router;
