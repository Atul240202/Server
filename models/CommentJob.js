import mongoose from 'mongoose';

const commentJobSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    keywords: [String],
    maxComments: {
      type: Number,
      required: true,
      min: 1,
      max: 20,
    },
    options: {
      minReactions: { type: Number, default: 10 },
      excludeJobPosts: { type: Boolean, default: true },
      messageTone: {
        type: String,
        enum: [
          'professional',
          'casual',
          'enthusiastic',
          'thoughtful',
          'friendly',
        ],
        default: 'professional',
      },
      wantEmoji: { type: Boolean, default: false },
      wantHashtags: { type: Boolean, default: false },
    },
    status: {
      type: String,
      enum: ['waiting', 'active', 'completed', 'failed'],
      default: 'waiting',
    },
    createdAt: { type: Date, default: Date.now },
    startedAt: Date,
    completedAt: Date,
    result: {
      success: Boolean,
      commentedCount: Number,
      totalPostsScraped: Number,
      sessionReport: {
        totalPostsScraped: Number,
        filteredPosts: Number,
        commentsPosted: Number,
        failed: Number,
      },
    },
    error: String,
    progress: {
      currentStep: String,
      stepProgress: Number,
      totalSteps: Number,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
commentJobSchema.index({ userId: 1, createdAt: -1 });
commentJobSchema.index({ status: 1 });
commentJobSchema.index({ createdAt: -1 });

// Virtual for job duration
commentJobSchema.virtual('duration').get(function () {
  if (this.startedAt && this.completedAt) {
    return this.completedAt - this.startedAt;
  }
  if (this.startedAt) {
    return Date.now() - this.startedAt;
  }
  return null;
});

// Ensure virtual fields are serialized
commentJobSchema.set('toJSON', { virtuals: true });
commentJobSchema.set('toObject', { virtuals: true });

export default mongoose.model('CommentJob', commentJobSchema);
