import cluster from 'cluster';
import os from 'os';
import { Worker } from 'bullmq';
import Redis from 'ioredis';

class WorkerClusterManager {
  constructor() {
    this.numWorkers = parseInt(process.env.WORKER_COUNT) || os.cpus().length;
    this.workers = [];
  }

  async start() {
    if (cluster.isMaster) {
      console.log(`Master ${process.pid} starting ${this.numWorkers} workers`);

      // Fork workers
      for (let i = 0; i < this.numWorkers; i++) {
        this.forkWorker();
      }

      // Handle worker deaths
      cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died (${signal || code})`);
        this.forkWorker();
      });

      // Handle graceful shutdown
      process.on('SIGTERM', async () => {
        console.log('Master received SIGTERM, shutting down workers...');
        for (const id in cluster.workers) {
          cluster.workers[id].kill();
        }
        process.exit(0);
      });
    } else {
      // Worker process
      await this.startWorker();
    }
  }

  forkWorker() {
    const worker = cluster.fork();
    console.log(`Started worker ${worker.process.pid}`);
  }

  async startWorker() {
    const { default: enhancedWorker } = await import(
      './enhancedLinkedInWorker.js'
    );

    console.log(`Worker ${process.pid} started`);

    process.on('SIGTERM', async () => {
      console.log(`Worker ${process.pid} shutting down...`);
      await enhancedWorker.close();
      process.exit(0);
    });
  }
}

export default WorkerClusterManager;
