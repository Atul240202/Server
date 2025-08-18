import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Connect to MongoDB
mongoose.connect(
  process.env.MONGODB_URI || 'mongodb://localhost:27017/linkedinDB'
);

// Import the Post model
import Post from '../models/Post.js';

async function migratePosts() {
  try {
    console.log('Starting migration: Adding userId to existing posts...');

    // Get all posts without userId
    const postsWithoutUserId = await Post.find({ userId: { $exists: false } });
    console.log(`Found ${postsWithoutUserId.length} posts without userId`);

    if (postsWithoutUserId.length === 0) {
      console.log('No posts need migration. Exiting...');
      return;
    }

    // Group posts by jobId to get userId from CommentJob
    const CommentJob = (await import('../models/CommentJob.js')).default;

    for (const post of postsWithoutUserId) {
      if (post.jobId) {
        try {
          const commentJob = await CommentJob.findById(post.jobId);
          if (commentJob && commentJob.userId) {
            // Update post with userId
            await Post.findByIdAndUpdate(post._id, {
              userId: commentJob.userId,
            });
            console.log(
              `Updated post ${post._id} with userId ${commentJob.userId}`
            );
          } else {
            console.log(
              `No CommentJob found for post ${post._id}, skipping...`
            );
          }
        } catch (error) {
          console.error(`Error updating post ${post._id}:`, error.message);
        }
      } else {
        console.log(`Post ${post._id} has no jobId, skipping...`);
      }
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run migration
migratePosts();
