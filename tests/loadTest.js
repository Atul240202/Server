import autocannon from 'autocannon';
import { faker } from '@faker-js/faker';

async function runLoadTest() {
  const instance = autocannon({
    url: 'http://localhost:5000',
    connections: 100, // Concurrent connections
    pipelining: 1,
    duration: 300, // 5 minutes
    requests: [
      {
        method: 'POST',
        path: '/api/auth/login',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      },
      {
        method: 'POST',
        path: '/api/start-comment-job',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer YOUR_TOKEN',
        },
        body: JSON.stringify({
          keywords: ['AI', 'Technology'],
          maxComments: 5,
          options: {
            minReactions: 10,
          },
        }),
      },
    ],
  });

  autocannon.track(instance, { renderProgressBar: true });

  instance.on('done', (results) => {
    console.log('Load test results:', results);
  });
}

runLoadTest();
