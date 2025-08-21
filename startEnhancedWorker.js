import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function startWorker() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Import and start worker
    const worker = await import('./workers/enhancedLinkedInWorker.js');
    console.log('✅ Enhanced LinkedIn Worker started');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('Shutting down worker...');
      await worker.default.close();
      await mongoose.disconnect();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start worker:', error);
    process.exit(1);
  }
}

startWorker();
