import mongoose from 'mongoose';
import Redis from 'ioredis';
import browserPool from './browserPool.js';

class HealthCheckService {
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
    });
  }

  async checkMongoDB() {
    try {
      const state = mongoose.connection.readyState;
      return {
        healthy: state === 1,
        status: ['disconnected', 'connected', 'connecting', 'disconnecting'][
          state
        ],
        responseTime: await this.measureMongoResponseTime(),
      };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  async measureMongoResponseTime() {
    const start = Date.now();
    await mongoose.connection.db.admin().ping();
    return Date.now() - start;
  }

  async checkRedis() {
    try {
      const start = Date.now();
      const pong = await this.redis.ping();
      return {
        healthy: pong === 'PONG',
        responseTime: Date.now() - start,
      };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  async checkBrowserPool() {
    try {
      const stats = browserPool.getStats();
      const totalBrowsers = Object.values(stats).reduce(
        (sum, userStats) => sum + userStats.size,
        0
      );

      return {
        healthy: true,
        totalBrowsers,
        stats,
      };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  async checkWorkerQueue() {
    try {
      const Queue = (await import('bullmq')).Queue;
      const queue = new Queue('comment-jobs', {
        connection: this.redis,
      });

      const [waiting, active, completed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
      ]);

      return {
        healthy: true,
        queue: { waiting, active, completed, failed },
      };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  async getFullHealthCheck() {
    const [mongodb, redis, browserPool, workerQueue] = await Promise.all([
      this.checkMongoDB(),
      this.checkRedis(),
      this.checkBrowserPool(),
      this.checkWorkerQueue(),
    ]);

    const isHealthy =
      mongodb.healthy &&
      redis.healthy &&
      browserPool.healthy &&
      workerQueue.healthy;

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: {
        mongodb,
        redis,
        browserPool,
        workerQueue,
      },
    };
  }
}

export default new HealthCheckService();
