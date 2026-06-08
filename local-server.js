import http from 'http';
import handler from './api/review.js';

// Setup basic environment variables if not set
if (!process.env.QWEN_API_KEY) {
  console.warn('⚠️  Warning: QWEN_API_KEY is not set. Real API reviews will fail.');
}
if (!process.env.GITHUB_TOKEN) {
  console.warn('⚠️  Warning: GITHUB_TOKEN is not set. Real API reviews will fail.');
}

const server = http.createServer(async (req, res) => {
  // Only handle POST requests at /api/review
  if (req.method === 'POST' && req.url === '/api/review') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        req.body = JSON.parse(body || '{}');
      } catch (e) {
        req.body = {};
      }
      
      // Mock Vercel response helper
      const resHelper = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        send(text) {
          res.writeHead(this.statusCode, { 'Content-Type': 'text/plain' });
          res.end(text);
          return this;
        },
        json(data) {
          res.writeHead(this.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
          return this;
        }
      };
      
      try {
        await handler(req, resHelper);
      } catch (err) {
        console.error('Handler Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found. Send POST request to http://localhost:3000/api/review.');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 CodeReview Autopilot local dev server running at http://localhost:${PORT}`);
  console.log(`Payload endpoint: http://localhost:${PORT}/api/review (POST)`);
});
