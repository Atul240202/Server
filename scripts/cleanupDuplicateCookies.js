import mongoose from 'mongoose';
import User from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
mongoose.connect(
  process.env.MONGODB_URI || 'mongodb://localhost:27017/linkedin-scraper'
);

async function cleanupDuplicateCookies() {
  try {
    console.log('Starting li_at cookie cleanup...');

    const users = await User.find({});
    console.log(`Found ${users.length} users to process`);

    let totalUsersProcessed = 0;
    let totalCookiesRemoved = 0;

    for (const user of users) {
      console.log(`\nProcessing user: ${user.email} (${user._id})`);

      // Get all LinkedIn cookies
      const linkedinCookies = user.cookies.filter((cookie) =>
        cookie.domain?.includes('linkedin.com')
      );

      if (linkedinCookies.length === 0) {
        console.log('  No LinkedIn cookies found');
        continue;
      }

      console.log(`  Found ${linkedinCookies.length} LinkedIn cookies`);

      // Remove all non-li_at cookies
      const nonLiAtCookies = linkedinCookies.filter(
        (cookie) => cookie.name !== 'li_at'
      );
      if (nonLiAtCookies.length > 0) {
        user.cookies = user.cookies.filter(
          (cookie) => !nonLiAtCookies.includes(cookie)
        );
        console.log(`  Removed ${nonLiAtCookies.length} non-li_at cookies`);
        totalCookiesRemoved += nonLiAtCookies.length;
      }

      // Get remaining li_at cookies
      const liAtCookies = user.cookies.filter(
        (cookie) =>
          cookie.name === 'li_at' && cookie.domain?.includes('linkedin.com')
      );

      if (liAtCookies.length === 0) {
        console.log('  No li_at cookies found');
        continue;
      }

      console.log(`  Found ${liAtCookies.length} li_at cookies`);

      // If multiple li_at cookies, keep only the most recent
      if (liAtCookies.length > 1) {
        // Sort by updatedAt (most recent first)
        liAtCookies.sort(
          (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
        );

        // Keep only the most recent li_at cookie
        const mostRecent = liAtCookies[0];
        const others = liAtCookies.slice(1);

        // Remove older li_at cookies
        for (const cookie of others) {
          const index = user.cookies.indexOf(cookie);
          if (index > -1) {
            user.cookies.splice(index, 1);
            totalCookiesRemoved++;
            console.log(
              `    Removed old li_at cookie from ${cookie.deviceId} (${cookie.updatedAt})`
            );
          }
        }
      }

      if (totalCookiesRemoved > 0) {
        await user.save();
        console.log(`  User updated: ${totalCookiesRemoved} cookies removed`);
      }

      totalUsersProcessed++;
    }

    console.log(`\n=== CLEANUP COMPLETE ===`);
    console.log(`Users processed: ${totalUsersProcessed}`);
    console.log(`Cookies removed: ${totalCookiesRemoved}`);
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed');
  }
}

// Run the cleanup
cleanupDuplicateCookies();
