import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import reviewHandler from './api/review.js';
import uploadHandler from './api/upload-review.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup basic environment variables if not set
if (!process.env.QWEN_API_KEY) {
  console.warn('⚠️  Warning: QWEN_API_KEY is not set. Real API reviews will fail.');
}
if (!process.env.GITHUB_TOKEN) {
  console.warn('⚠️  Warning: GITHUB_TOKEN is not set. Real API reviews will fail.');
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Mock Vercel response helper
  const makeResHelper = (resObj) => ({
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(text) {
      resObj.writeHead(this.statusCode, { 'Content-Type': 'text/plain' });
      resObj.end(text);
      return this;
    },
    json(data) {
      resObj.writeHead(this.statusCode, { 'Content-Type': 'application/json' });
      resObj.end(JSON.stringify(data));
      return this;
    }
  });

  // 1. API: GitHub Webhook Review Endpoint
  if (req.method === 'POST' && pathname === '/api/review') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        req.body = JSON.parse(body || '{}');
      } catch (e) {
        req.body = {};
      }
      await reviewHandler(req, makeResHelper(res));
    });
    return;
  }

  // 2. API: On-demand Upload Code Review Endpoint
  if (req.method === 'POST' && pathname === '/api/upload-review') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        req.body = JSON.parse(body || '{}');
      } catch (e) {
        req.body = {};
      }
      await uploadHandler(req, makeResHelper(res));
    });
    return;
  }

  // 3. Static Files: UI Client
  if (req.method === 'GET') {
    let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
    
    // Prevent directory traversal attacks or loading system files outside directory
    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Access Denied');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml'
      };

      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      res.end(data);
    });
    return;
  }

  // Default Fallback
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 CodeReview Autopilot local dev server running at http://localhost:${PORT}`);
  console.log(`Web App Dashboard: http://localhost:${PORT}`);
  console.log(`Webhook Endpoint:  http://localhost:${PORT}/api/review (POST)`);
  console.log(`Upload Endpoint:   http://localhost:${PORT}/api/upload-review (POST)`);
});
