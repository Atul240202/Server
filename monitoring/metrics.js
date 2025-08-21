import promClient from 'prom-client';
import express from 'express';

const register = new promClient.Registry();

// Default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics
const metrics = {
  jobsCreated: new promClient.Counter({
    name: 'linkedin_jobs_created_total',
    help: 'Total number of jobs created',
    labelNames: ['user_id', 'status'],
    registers: [register],
  }),

  jobDuration: new promClient.Histogram({
    name: 'linkedin_job_duration_seconds',
    help: 'Job processing duration',
    labelNames: ['status'],
    buckets: [10, 30, 60, 120, 300, 600, 1800],
    registers: [register],
  }),

  activeBrowsers: new promClient.Gauge({
    name: 'active_browsers_count',
    help: 'Number of active browser instances',
    labelNames: ['user_id'],
    registers: [register],
  }),

  rateLimitHits: new promClient.Counter({
    name: 'rate_limit_hits_total',
    help: 'Number of rate limit hits',
    labelNames: ['limiter_type', 'user_id'],
    registers: [register],
  }),

  linkedinApiCalls: new promClient.Counter({
    name: 'linkedin_api_calls_total',
    help: 'LinkedIn API calls',
    labelNames: ['action', 'status'],
    registers: [register],
  }),

  cookieValidations: new promClient.Counter({
    name: 'cookie_validations_total',
    help: 'Cookie validation attempts',
    labelNames: ['user_id', 'result'],
    registers: [register],
  }),
};

const metricsRouter = express.Router();
metricsRouter.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

export { metrics, metricsRouter, register };
