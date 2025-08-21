import puppeteer from 'puppeteer';
import genericPool from 'generic-pool';

class BrowserPool {
  constructor() {
    this.pools = new Map(); // One pool per user
  }

  createPoolForUser(userId) {
    if (this.pools.has(userId)) {
      return this.pools.get(userId);
    }

    const factory = {
      create: async () => {
        const browser = await puppeteer.launch({
          headless: process.env.NODE_ENV === 'production',
          userDataDir: `./browser-profiles/${userId}`,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
          ],
        });
        return browser;
      },
      destroy: async (browser) => {
        await browser.close();
      },
      validate: async (browser) => {
        return browser.isConnected();
      },
    };

    const opts = {
      min: 0,
      max: 3, // Max 3 browsers per user
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 600000, // 10 minutes
      evictionRunIntervalMillis: 60000,
    };

    const pool = genericPool.createPool(factory, opts);
    this.pools.set(userId, pool);

    return pool;
  }

  async acquire(userId) {
    const pool = this.createPoolForUser(userId);
    return await pool.acquire();
  }

  async release(userId, browser) {
    const pool = this.pools.get(userId);
    if (pool) {
      await pool.release(browser);
    }
  }

  async drainUser(userId) {
    const pool = this.pools.get(userId);
    if (pool) {
      await pool.drain();
      await pool.clear();
      this.pools.delete(userId);
    }
  }

  async drainAll() {
    for (const [userId, pool] of this.pools) {
      await pool.drain();
      await pool.clear();
    }
    this.pools.clear();
  }

  getStats() {
    const stats = {};
    for (const [userId, pool] of this.pools) {
      stats[userId] = {
        size: pool.size,
        available: pool.available,
        borrowed: pool.borrowed,
        pending: pool.pending,
      };
    }
    return stats;
  }
}

export default new BrowserPool();
