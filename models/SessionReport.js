import mongoose from 'mongoose';

const sessionReportSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommentJob',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    totalPostsScraped: {
      type: Number,
      default: 0,
    },
    filteredPosts: {
      type: Number,
      default: 0,
    },
    commentsPosted: {
      type: Number,
      default: 0,
    },
    failed: {
      type: Number,
      default: 0,
    },
    duration: {
      type: Number,
      default: 0,
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: Date,
    successRate: {
      type: Number,
      default: 0,
    },
    errors: [
      {
        message: String,
        timestamp: { type: Date, default: Date.now },
        step: String,
      },
    ],
    performance: {
      scrapingTime: Number,
      filteringTime: Number,
      commentingTime: Number,
      totalTime: Number,
    },
    keywords: [String],
    targetKeywords: [String],
  },
  {
    timestamps: true,
    suppressReservedKeysWarning: true,
  }
);

// Indexes for better query performance
sessionReportSchema.index({ jobId: 1 });
sessionReportSchema.index({ userId: 1, createdAt: -1 });
sessionReportSchema.index({ createdAt: -1 });

// Virtual for success rate
sessionReportSchema.virtual('successRatePercentage').get(function () {
  if (this.totalPostsScraped > 0) {
    return ((this.commentsPosted / this.totalPostsScraped) * 100).toFixed(2);
  }
  return 0;
});

// Virtual for duration in minutes
sessionReportSchema.virtual('durationMinutes').get(function () {
  if (this.duration) {
    return Math.round(this.duration / (1000 * 60));
  }
  return 0;
});

// Ensure virtual fields are serialized
sessionReportSchema.set('toJSON', { virtuals: true });
sessionReportSchema.set('toObject', { virtuals: true });

export default mongoose.model('SessionReport', sessionReportSchema);
