# LinkedPostRefinement Worker

This is a modified version of the `linkedPostRefinementWorker.js` that has been adapted to work as a BullMQ worker for the comment queue system.

## What Changed

The original `linkedPostRefinementWorker.js` was a standalone script that ran immediately when executed. It has been modified to:

1. **Work as a BullMQ Worker**: Now processes jobs from the `comment-jobs` queue
2. **Use Job Data**: Accepts job parameters like `jobId`, `userId`, `keywords`, `maxComments`, and `options`
3. **Database Integration**: Updates job status and progress in MongoDB
4. **Session Reports**: Creates session reports in the database instead of JSON files
5. **Progress Tracking**: Provides real-time progress updates

## How to Use

### Start the Worker

```bash
# Production
npm run worker:linkedpost

# Development (with auto-restart)
npm run worker:linkedpost:dev
```

### How It Works

1. **Job Processing**: The worker listens to the `comment-jobs` queue
2. **Cookie Validation**: Checks if the user has valid LinkedIn cookies
3. **Post Scraping**: Uses the original scraping logic to find posts based on keywords
4. **AI Comment Generation**: Generates comments using the existing AI logic
5. **Comment Posting**: Posts comments on LinkedIn with rate limiting
6. **Progress Updates**: Updates job progress throughout the process
7. **Session Reports**: Creates detailed session reports in the database

## Key Features

- **Same Logic**: Uses the exact same scraping and commenting logic as the original script
- **Queue Integration**: Works seamlessly with the existing queue system
- **Database Updates**: Updates job status and creates session reports
- **Error Handling**: Comprehensive error handling and retry logic
- **Rate Limiting**: Built-in delays to avoid LinkedIn restrictions

## Configuration

The worker uses the same configuration as the original script:

- AI comment generation settings
- Rate limiting delays
- Post filtering criteria
- LinkedIn selectors and navigation logic

## Differences from Original

- **No Immediate Execution**: Doesn't run immediately when imported
- **Job-Based**: Processes jobs from the queue instead of running standalone
- **Database Integration**: Uses MongoDB instead of JSON files
- **Progress Tracking**: Provides real-time progress updates
- **Error Recovery**: Better error handling and recovery mechanisms

## Testing

To test the new worker:

1. Start the worker: `npm run worker:linkedpost:dev`
2. Create a comment job through the dashboard or API
3. The worker will process the job using the linkedPostRefinement logic
4. Monitor progress in the dashboard

The worker will use the same proven scraping and commenting logic as the original script, but with the added benefits of queue management and database integration.
