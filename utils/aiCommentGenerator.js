import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Default AI configuration
const DEFAULT_AI_CONFIG = {
  wantEmoji: false,
  wantHashtags: false,
  messageTone: 'professional',
  maxLength: 25,
};

/**
 * Update AI configuration
 * @param {Object} newConfig - New configuration object
 */
export function updateAIConfig(newConfig) {
  if (newConfig.wantEmoji !== undefined)
    DEFAULT_AI_CONFIG.wantEmoji = newConfig.wantEmoji;
  if (newConfig.wantHashtags !== undefined)
    DEFAULT_AI_CONFIG.wantHashtags = newConfig.wantHashtags;
  if (newConfig.messageTone !== undefined)
    DEFAULT_AI_CONFIG.messageTone = newConfig.messageTone;
  if (newConfig.maxLength !== undefined)
    DEFAULT_AI_CONFIG.maxLength = newConfig.maxLength;

  console.log('AI Configuration updated:', DEFAULT_AI_CONFIG);
}

/**
 * Get current AI configuration
 * @returns {Object} Current AI configuration
 */
export function getAIConfig() {
  return { ...DEFAULT_AI_CONFIG };
}

/**
 * Generate AI comment for a LinkedIn post
 * @param {string} postContent - The content of the LinkedIn post
 * @param {Object} config - Optional AI configuration override
 * @returns {Promise<string>} Generated comment
 */
export async function generateAIComment(postContent, config = {}) {
  try {
    const aiConfig = { ...DEFAULT_AI_CONFIG, ...config };

    const emojiInstruction = aiConfig.wantEmoji
      ? 'Include 1-2 relevant emojis'
      : 'Do not include any emojis';
    const hashtagInstruction = aiConfig.wantHashtags
      ? 'Include 2-3 relevant hashtags'
      : 'Do not include hashtags';
    const toneInstruction = `Use a ${aiConfig.messageTone} tone`;
    const lengthInstruction = `Keep the comment to maximum ${aiConfig.maxLength} words`;

    const prompt = `You are a professional LinkedIn user who engages thoughtfully with posts. 
    
    Generate a natural, engaging comment for this LinkedIn post. The comment should:
    - Be authentic and conversational (not robotic)
    - Show genuine interest in the topic
    - ${lengthInstruction}
    - Avoid generic responses like "Great post!" or "Thanks for sharing!"
    - Add value or insight when possible
    - ${toneInstruction}
    - ${emojiInstruction}
    - ${hashtagInstruction}
    
    Post content: "${postContent}"
    
    Generate only the comment text (no explanations):`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content:
            'You are a professional LinkedIn user who creates engaging, authentic comments.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 100,
      temperature: 0.7,
      top_p: 0.9,
    });

    const generatedComment = response.choices[0].message.content.trim();
    console.log(`AI generated comment: "${generatedComment}"`);
    return generatedComment;
  } catch (error) {
    console.log(`Error generating AI comment: ${error.message}`);
    return 'Really great thought';
  }
}

/**
 * Generate advanced AI comment with engagement context
 * @param {string} postContent - The content of the LinkedIn post
 * @param {number} postReactions - Number of reactions on the post
 * @param {number} postComments - Number of comments on the post
 * @param {Object} config - Optional AI configuration override
 * @returns {Promise<string>} Generated comment
 */
export async function generateAdvancedAIComment(
  postContent,
  postReactions,
  postComments,
  config = {}
) {
  try {
    const aiConfig = { ...DEFAULT_AI_CONFIG, ...config };

    const isHighEngagement = postReactions > 50 || postComments > 10;
    const isLowEngagement = postReactions < 10 && postComments < 3;

    let engagementContext = '';
    if (isHighEngagement) {
      engagementContext =
        'This post has high engagement, so your comment should be thoughtful and add value to stand out.';
    } else if (isLowEngagement) {
      engagementContext =
        'This post has low engagement, so your comment should be encouraging and supportive.';
    }

    const emojiInstruction = aiConfig.wantEmoji
      ? 'Include 1-2 relevant emojis'
      : 'Do not include any emojis';
    const hashtagInstruction = aiConfig.wantHashtags
      ? 'Include 2-3 relevant hashtags'
      : 'Do not include hashtags';
    const toneInstruction = `Use a ${aiConfig.messageTone} tone`;
    const lengthInstruction = `Keep the comment to maximum ${aiConfig.maxLength} words`;

    const prompt = `You are a professional LinkedIn user who creates engaging comments.

    CONTEXT:
    - Post content: "${postContent}"
    - Reactions: ${postReactions}
    - Comments: ${postComments}
    ${engagementContext}

    COMMENT REQUIREMENTS:
    - Be authentic and conversational
    - ${lengthInstruction}
    - Add value or insight when possible
    - ${toneInstruction}
    - ${emojiInstruction}
    - ${hashtagInstruction}
    - Avoid generic responses
    - Match the post's tone and topic

    Generate only the comment text:`;

    console.log('Making OpenAI API request...');
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content:
            'You are a professional LinkedIn user who creates engaging, authentic comments based on post context and engagement levels.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 120,
      temperature: 0.8,
      top_p: 0.9,
    });

    console.log(`API Response status: ${response.status}`);

    if (
      !response.choices ||
      !response.choices[0] ||
      !response.choices[0].message
    ) {
      throw new Error('Invalid response format from OpenAI API');
    }

    const generatedComment = response.choices[0].message.content.trim();
    console.log(`Advanced AI comment generated: "${generatedComment}"`);
    return generatedComment;
  } catch (error) {
    console.log(`Error generating advanced AI comment: ${error.message}`);
    return 'Really great thought';
  }
}

