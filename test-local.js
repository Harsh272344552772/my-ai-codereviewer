// 1. Setup mock environment variables before importing any libraries
if (!process.env.QWEN_API_KEY) {
  process.env.QWEN_API_KEY = 'mock-qwen-api-key';
}
if (!process.env.GITHUB_TOKEN) {
  process.env.GITHUB_TOKEN = 'mock-github-token';
}

const isLive = process.argv.includes('--live');

if (!isLive) {
  console.log('🔄 Running in MOCK mode using global fetch interception. Run with "--live" to make actual API calls.');
  
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async function (url, options) {
    const urlString = url.toString();
    
    // Intercept GitHub Get Files request
    if (urlString.includes('/pulls/42/files')) {
      console.log(`[Mock Fetch] Intercepted GET files: ${urlString}`);
      return new Response(JSON.stringify([
        {
          filename: 'mathUtils.js',
          patch: '@@ -1,5 +1,9 @@\n function divide(a, b) {\n-  return a / b;\n+  let result = a / b; // bug: what if b is zero?\n+  return result;\n }'
        },
        {
          filename: 'package-lock.json',
          patch: '@@ -5,4 +5,8 @@\n     "dependencies": {\n+      "some-pkg": "1.0.0"\n     }'
        },
        {
          filename: 'logo.png',
          patch: null
        }
      ]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Intercept Qwen Chat Completions request
    if (urlString.includes('/chat/completions')) {
      console.log(`[Mock Fetch] Intercepted Qwen Chat Completion request to: ${urlString}`);
      if (options && options.body) {
        const parsedBody = JSON.parse(options.body);
        console.log(`[Mock Fetch] Model: ${parsedBody.model}`);
        console.log(`[Mock Fetch] Prompt content length: ${parsedBody.messages[0].content.length} chars`);
      }
      return new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                issues: [
                  {
                    file: 'mathUtils.js',
                    line: 3,
                    type: 'bug',
                    message: 'Potential division by zero when parameter b is 0. Add a check to prevent division by zero.'
                  }
                ],
                summary: 'Identified a critical division by zero bug in mathUtils.js. Lockfiles and media files were successfully ignored.',
                auto_merge_safe: false
              })
            }
          }
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Intercept GitHub Create Comment request
    if (urlString.includes('/comments')) {
      console.log(`[Mock Fetch] Intercepted POST Comment: ${urlString}`);
      if (options && options.body) {
        const parsed = JSON.parse(options.body);
        console.log(`[Mock Fetch] Comment Body:\n\n${parsed.body}\n`);
      }
      return new Response(JSON.stringify({ id: 12345 }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Intercept GitHub Create Label request
    if (urlString.includes('/labels')) {
      console.log(`[Mock Fetch] Intercepted POST Label: ${urlString}`);
      if (options && options.body) {
        console.log(`[Mock Fetch] Label Options:`, options.body);
      }
      return new Response(JSON.stringify([{ name: 'ai-approved' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fallback to original fetch for other URLs
    return originalFetch(url, options);
  };
} else {
  console.log('⚡ Running in LIVE integration mode (connecting to Qwen and GitHub)...');
  if (process.env.QWEN_API_KEY === 'mock-qwen-api-key' || process.env.GITHUB_TOKEN === 'mock-github-token') {
    console.error('❌ Error: Live mode requires real QWEN_API_KEY and GITHUB_TOKEN environment variables.');
    process.exit(1);
  }
}

// 2. NOW dynamically import the dependencies and the handler
const { Octokit } = await import('@octokit/rest');
const { OpenAI } = await import('openai');
const { default: handler } = await import('./api/review.js');

// Mock request and response objects
const mockReq = {
  method: 'POST',
  body: {
    action: 'opened',
    pull_request: {
      number: 1,
      title: 'Test AI review capabilities'
    },
    repository: {
      name: 'my-ai-codereviewer',
      full_name: 'Harsh272344552772/my-ai-codereviewer',
      owner: {
        login: 'Harsh272344552772'
      }
    }
  }
};

const mockRes = {
  statusCode: 200,
  status(code) {
    this.statusCode = code;
    return this;
  },
  send(message) {
    console.log(`\nResponse Sent (Text): [Status ${this.statusCode}]`, message);
    return this;
  },
  json(data) {
    console.log(`\nResponse Sent (JSON): [Status ${this.statusCode}]`, JSON.stringify(data, null, 2));
    return this;
  }
};

// Execute handler
(async () => {
  try {
    await handler(mockReq, mockRes);
  } catch (err) {
    console.error('Unhandled handler error:', err);
  }
})();
