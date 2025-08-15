import { Queue } from 'bullmq';
import Redis from 'ioredis';
import CommentJob from '../models/CommentJob.js';
import Post from '../models/Post.js';
import SessionReport from '../models/SessionReport.js';

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: null, // BullMQ requirement
});

// Create the comment job queue
const commentQueue = new Queue('comment-jobs', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50, // Keep last 50 failed jobs
    attempts: 3, // Retry failed jobs up to 3 times
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 second delay
    },
  },
});

/**
 * Add a new comment job to the queue
 */
export const addCommentJob = async (jobData) => {
  try {
    const job = await commentQueue.add('process-comment-job', jobData, {
      priority: 1,
      delay: 0,
      jobId: jobData.jobId, // Use the database job ID
    });

    console.log(`Comment job added to queue: ${job.id}`);
    return job;
  } catch (error) {
    console.error('Error adding comment job to queue:', error);
    throw error;
  }
};

/**
 * Get queue statistics
 */
export const getQueueStats = async () => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      commentQueue.getWaiting(),
      commentQueue.getActive(),
      commentQueue.getCompleted(),
      commentQueue.getFailed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length,
    };
  } catch (error) {
    console.error('Error getting queue stats:', error);
    throw error;
  }
};

/**
 * Get detailed job information
 */
export const getJobDetails = async (jobId) => {
  try {
    const job = await commentQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress;
    const data = job.data;

    return {
      id: job.id,
      state,
      progress,
      data,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  } catch (error) {
    console.error('Error getting job details:', error);
    throw error;
  }
};

/**
 * Get all jobs with their states
 */
export const getAllJobs = async () => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      commentQueue.getWaiting(),
      commentQueue.getActive(),
      commentQueue.getCompleted(),
      commentQueue.getFailed(),
    ]);

    return {
      waiting: waiting.map((job) => ({
        id: job.id,
        data: job.data,
        timestamp: job.timestamp,
      })),
      active: active.map((job) => ({
        id: job.id,
        data: job.data,
        timestamp: job.timestamp,
        progress: job.progress,
      })),
      completed: completed.map((job) => ({
        id: job.id,
        data: job.data,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
      })),
      failed: failed.map((job) => ({
        id: job.id,
        data: job.data,
        timestamp: job.timestamp,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
      })),
    };
  } catch (error) {
    console.error('Error getting all jobs:', error);
    throw error;
  }
};

/**
 * Clean completed and failed jobs
 */
export const cleanQueue = async () => {
  try {
    await commentQueue.clean(0, 'completed');
    await commentQueue.clean(0, 'failed');

    console.log('Queue cleaned successfully');
    return { success: true, message: 'Queue cleaned successfully' };
  } catch (error) {
    console.error('Error cleaning queue:', error);
    throw error;
  }
};

/**
 * Pause the queue
 */
export const pauseQueue = async () => {
  try {
    await commentQueue.pause();
    console.log('Queue paused successfully');
    return { success: true, message: 'Queue paused successfully' };
  } catch (error) {
    console.error('Error pausing queue:', error);
    throw error;
  }
};

/**
 * Resume the queue
 */
export const resumeQueue = async () => {
  try {
    await commentQueue.resume();
    console.log('Queue resumed successfully');
    return { success: true, message: 'Queue resumed successfully' };
  } catch (error) {
    console.error('Error resuming queue:', error);
    throw error;
  }
};

/**
 * Remove a specific job from the queue
 */
export const removeJob = async (jobId) => {
  try {
    const job = await commentQueue.getJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    await job.remove();
    console.log(`Job ${jobId} removed from queue`);
    return { success: true, message: `Job ${jobId} removed successfully` };
  } catch (error) {
    console.error('Error removing job:', error);
    throw error;
  }
};

/**
 * Retry a failed job
 */
export const retryJob = async (jobId) => {
  try {
    const job = await commentQueue.getJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    if (job.failedReason) {
      await job.retry();
      console.log(`Job ${jobId} retried successfully`);
      return { success: true, message: `Job ${jobId} retried successfully` };
    } else {
      throw new Error('Job is not in failed state');
    }
  } catch (error) {
    console.error('Error retrying job:', error);
    throw error;
  }
};

/**
 * Get queue health status
 */
export const getQueueHealth = async () => {
  try {
    const stats = await getQueueStats();
    const isHealthy = stats.failed < 10; // Consider healthy if less than 10 failed jobs

    return {
      isHealthy,
      stats,
      timestamp: new Date().toISOString(),
      redisConnection: redis.status === 'ready',
    };
  } catch (error) {
    console.error('Error getting queue health:', error);
    return {
      isHealthy: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      redisConnection: false,
    };
  }
};

// Event listeners for monitoring
commentQueue.on('completed', async (job) => {
  try {
    console.log(`Job ${job.id} completed successfully`);

    // Update database job status
    await CommentJob.findByIdAndUpdate(job.data.jobId, {
      status: 'completed',
      'progress.currentStep': 'Completed',
      'progress.stepProgress': 100,
      completedAt: new Date(),
    });
  } catch (error) {
    console.error('Error updating completed job in database:', error);
  }
});

commentQueue.on('failed', async (job, err) => {
  try {
    console.log(`Job ${job.id} failed:`, err.message);

    // Update database job status
    await CommentJob.findByIdAndUpdate(job.data.jobId, {
      status: 'failed',
      error: err.message,
      'progress.currentStep': 'Failed',
      completedAt: new Date(),
    });
  } catch (error) {
    console.error('Error updating failed job in database:', error);
  }
});

commentQueue.on('active', async (job) => {
  try {
    console.log(`Job ${job.id} started processing`);

    // Update database job status
    await CommentJob.findByIdAndUpdate(job.data.jobId, {
      status: 'active',
      startedAt: new Date(),
      'progress.currentStep': 'Processing',
      'progress.stepProgress': 0,
    });
  } catch (error) {
    console.error('Error updating active job in database:', error);
  }
});

commentQueue.on('progress', async (job, progress) => {
  try {
    console.log(`Job ${job.id} progress: ${progress}%`);

    // Update database job progress
    await CommentJob.findByIdAndUpdate(job.data.jobId, {
      'progress.stepProgress': progress,
    });
  } catch (error) {
    console.error('Error updating job progress in database:', error);
  }
});

export default commentQueue;
