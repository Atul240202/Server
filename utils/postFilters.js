/**
 * Stop words that indicate posts to skip
 */
const STOP_WORDS = [
  'hiring',
  "we're looking for",
  'job opportunity',
  'new position at',
  'looking for',
  'join our team',
  'work anniversary',
  'started a new position',
  'say congrats',
  'congratulations',
  'happy work anniversary',
  'celebrating',
];

/**
 * Check if a post should be excluded based on content
 * @param {string} postText - The post content
 * @returns {boolean} True if post should be excluded
 */
export function isExcludedPost(postText) {
  return STOP_WORDS.some((word) => postText.toLowerCase().includes(word));
}

/**
 * Check if a post is recent (within 7 days)
 * @param {string} postText - The post content
 * @returns {boolean} True if post is recent
 */
export function isRecentPost(postText) {
  const match = postText.match(/(\d{1,2} [A-Za-z]+ \d{4})/);
  if (!match) return false;
  const postDate = new Date(match[1]);
  const now = new Date();
  const diffDays = (now - postDate) / (1000 * 60 * 60 * 24);
  return diffDays <= 7;
}

/**
 * Rank posts by engagement (reactions + comments)
 * @param {Array} posts - Array of post objects
 * @returns {Array} Sorted posts by engagement
 */
export function rankPosts(posts) {
  return posts.sort((a, b) => {
    const aScore = a.reactions + a.comments;
    const bScore = b.reactions + b.comments;
    return bScore - aScore;
  });
}

/**
 * Filter posts based on engagement threshold
 * @param {Array} posts - Array of post objects
 * @param {number} minReactions - Minimum reactions threshold
 * @returns {Array} Filtered posts
 */
export function filterByEngagement(posts, minReactions = 5) {
  return posts.filter((post) => post.reactions >= minReactions);
}

/**
 * Filter posts by content quality
 * @param {Array} posts - Array of post objects
 * @returns {Array} Filtered posts
 */
export function filterByContentQuality(posts) {
  return posts.filter((post) => {
    // Skip posts with stop words
    if (isExcludedPost(post.content)) {
      return false;
    }

    // Skip very short posts (likely just links or minimal content)
    if (post.content.length < 50) {
      return false;
    }

    return true;
  });
}

/**
 * Main filterPosts function - simplified version for the worker
 * @param {Array} posts - Array of post objects
 * @param {Object} options - Filtering options
 * @returns {Array} Filtered and ranked posts
 */
export function filterPosts(posts, options = {}) {
  const {
    minReactions = 10,
    excludeJobPosts = true,
    messageTone = 'professional',
    wantEmoji = false,
    wantHashtags = false,
  } = options;

  let filteredPosts = [...posts];

  // Filter by engagement threshold
  filteredPosts = filteredPosts.filter(
    (post) => post.reactions >= minReactions
  );

  // Filter out job posts if requested
  if (excludeJobPosts) {
    filteredPosts = filteredPosts.filter(
      (post) => !isExcludedPost(post.text || post.content)
    );
  }

  // Filter by content quality (skip very short posts)
  filteredPosts = filteredPosts.filter((post) => {
    const content = post.text || post.content || '';
    return content.length >= 30; // Minimum content length
  });

  // Rank by engagement (reactions + comments)
  filteredPosts.sort((a, b) => {
    const aScore = (a.reactions || 0) + (a.comments || 0);
    const bScore = (b.reactions || 0) + (b.comments || 0);
    return bScore - aScore;
  });

  return filteredPosts;
}

/**
 * Comprehensive post filtering and ranking
 * @param {Array} posts - Array of post objects
 * @param {Object} options - Filtering options
 * @returns {Array} Filtered and ranked posts
 */
export function filterAndRankPosts(posts, options = {}) {
  const {
    minReactions = 5,
    excludeJobPosts = true,
    excludeAnnouncements = true,
    minContentLength = 50,
    maxAgeDays = 30,
  } = options;

  let filteredPosts = [...posts];

  // Filter by engagement
  filteredPosts = filterByEngagement(filteredPosts, minReactions);

  // Filter by content quality
  filteredPosts = filterByContentQuality(filteredPosts);

  // Filter by content length
  filteredPosts = filteredPosts.filter(
    (post) => post.content.length >= minContentLength
  );

  // Filter by age if specified
  if (maxAgeDays) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    filteredPosts = filteredPosts.filter((post) => {
      if (!post.timestamp) return true;
      const postDate = new Date(post.timestamp);
      return postDate >= cutoffDate;
    });
  }

  // Rank by engagement
  return rankPosts(filteredPosts);
}

/**
 * Get post engagement score
 * @param {Object} post - Post object
 * @returns {number} Engagement score
 */
export function getPostEngagementScore(post) {
  const reactionsWeight = 1;
  const commentsWeight = 2; // Comments are more valuable than reactions

  return post.reactions * reactionsWeight + post.comments * commentsWeight;
}

/**
 * Check if post has high engagement
 * @param {Object} post - Post object
 * @returns {boolean} True if post has high engagement
 */
export function hasHighEngagement(post) {
  return post.reactions > 50 || post.comments > 10;
}

/**
 * Check if post has low engagement
 * @param {Object} post - Post object
 * @returns {boolean} True if post has low engagement
 */
export function hasLowEngagement(post) {
  return post.reactions < 10 && post.comments < 3;
}
