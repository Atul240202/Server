import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function addIndexes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const db = mongoose.connection.db;

    // User indexes
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db
      .collection('users')
      .createIndex({ 'cookies.name': 1, 'cookies.domain': 1 });
    await db.collection('users').createIndex({ 'devices.deviceId': 1 });

    // CommentJob indexes
    await db
      .collection('commentjobs')
      .createIndex({ userId: 1, createdAt: -1 });
    await db.collection('commentjobs').createIndex({ status: 1 });
    await db.collection('commentjobs').createIndex({ createdAt: -1 });

    // Post indexes
    await db
      .collection('posts')
      .createIndex({ postUrl: 1, userId: 1 }, { unique: true });
    await db.collection('posts').createIndex({ jobId: 1 });
    await db.collection('posts').createIndex({ userId: 1, scrapedAt: -1 });

    // SessionReport indexes
    await db.collection('sessionreports').createIndex({ jobId: 1 });
    await db
      .collection('sessionreports')
      .createIndex({ userId: 1, createdAt: -1 });

    console.log('✅ All indexes created successfully');
  } catch (error) {
    console.error('Error creating indexes:', error);
  } finally {
    await mongoose.disconnect();
  }
}

addIndexes();
