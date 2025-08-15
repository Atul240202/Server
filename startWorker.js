import dotenv from 'dotenv';
import mongoose from 'mongoose';
import commentWorker from './workers/commentWorker.js';

dotenv.config();

console.log('🚀 Starting Comment Worker...');

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/linkedinDB')
  .then(() => {
    console.log('✅ Worker connected to MongoDB');
  })
  .catch((error) => {
    console.error('❌ Worker MongoDB connection error:', error);
    process.exit(1);
  });

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Worker received ${signal}, shutting down gracefully...`);

  try {
    // Close the worker
    await commentWorker.close();
    console.log('✅ Worker closed successfully');

    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');

    console.log('👋 Worker shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

console.log('📊 Comment worker is running and ready to process jobs...');
console.log('Press Ctrl+C to stop the worker');
