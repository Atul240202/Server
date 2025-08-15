import mongoose from 'mongoose';

const postSchema = new mongoose.Schema(
  {
    postUrl: {
      type: String,
      required: true,
      unique: true,
    },
    content: {
      type: String,
      required: true,
    },
    reactions: {
      type: Number,
      default: 0,
    },
    comments: {
      type: Number,
      default: 0,
    },
    isCommented: {
      type: Boolean,
      default: false,
    },
    commentedText: String,
    commentedAt: Date,
    scrapedAt: {
      type: Date,
      default: Date.now,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommentJob',
    },
    keywords: [String],
    engagement: {
      totalEngagement: Number,
      engagementRate: Number,
    },
    metadata: {
      author: String,
      postType: String,
      hashtags: [String],
      mentions: [String],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
postSchema.index({ jobId: 1 });
postSchema.index({ scrapedAt: -1 });
postSchema.index({ isCommented: 1 });
postSchema.index({ reactions: -1 });

// Virtual for engagement rate
postSchema.virtual('engagementRate').get(function () {
  if (this.reactions > 0) {
    return (((this.reactions + this.comments) / this.reactions) * 100).toFixed(
      2
    );
  }
  return 0;
});

// Ensure virtual fields are serialized
postSchema.set('toJSON', { virtuals: true });
postSchema.set('toObject', { virtuals: true });

export default mongoose.model('Post', postSchema);
