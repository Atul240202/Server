import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';

const createMonitoringDashboard = (app) => {
  // Create queue instances for monitoring
  const commentQueue = new Queue('comment-jobs', {
    connection: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
    },
  });

  // Setup Bull Board
  const serverAdapter = new ExpressAdapter();
  const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
    queues: [new BullMQAdapter(commentQueue)],
    serverAdapter,
  });

  serverAdapter.setBasePath('/admin/queues');
  app.use('/admin/queues', serverAdapter.getRouter());

  // Custom monitoring endpoints
  app.get('/admin/metrics', async (req, res) => {
    const healthCheck = await healthCheckService.getFullHealthCheck();
    const rateLimits = await rateLimiterService.getLimitsStatus(req.userId);
    const browserStats = browserPool.getStats();

    res.json({
      health: healthCheck,
      rateLimits,
      browserStats,
      timestamp: new Date().toISOString(),
    });
  });
};

export default createMonitoringDashboard;
