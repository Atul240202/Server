import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

console.log('Environment Variables Check:');
console.log('============================');
console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET'}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'NOT SET'}`);
console.log(`REDIS_HOST: ${process.env.REDIS_HOST || 'localhost'}`);
console.log(`REDIS_PORT: ${process.env.REDIS_PORT || '6379'}`);

if (process.env.OPENAI_API_KEY) {
  console.log(`API Key starts with: ${process.env.OPENAI_API_KEY.substring(0, 20)}...`);
} else {
  console.log('WARNING: OPENAI_API_KEY is not set!');
}
