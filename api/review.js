import { OpenAI } from 'openai';
import { Octokit } from '@octokit/rest';

// 1. Setup Qwen (Alibaba Cloud) via OpenAI-compatible SDK
const qwen = new OpenAI({
  apiKey: process.env.QWEN_API_KEY || 'dummy-qwen-key-for-local-boot',
  baseURL: process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  fetch: (...args) => globalThis.fetch(...args)
});

// 2. Setup GitHub
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Allowed list of reviewable files, excluding lockfiles and binaries
const IGNORED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.pdf', '.zip', '.gz', '.mp4', '.mov', '.mp3'];
const IGNORED_FILENAMES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'go.sum', 'cargo.lock', 'composer.lock'];

export default async function handler(req, res) {
  // Only accept POST requests (webhook triggers)
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { pull_request, repository } = req.body;

  // Simple validation to ensure it's a PR webhook payload
  if (!pull_request) {
    return res.status(400).json({ error: 'No PR data received. Make sure this webhook is triggered by Pull Request events.' });
  }

  // We only care about PR opened, synchronized, or reopened events
  const action = req.body.action;
  if (action && !['opened', 'synchronize', 'reopened'].includes(action)) {
    console.log(`Skipping action "${action}" for PR #${pull_request.number}.`);
    return res.status(200).json({ success: true, message: `Ignored action: ${action}` });
  }

  console.log(`Analyzing PR #${pull_request.number} ("${pull_request.title}") for ${repository.full_name}...`);

  try {
    const owner = repository.owner.login;
    const repo = repository.name;
    const pull_number = pull_request.number;

    // 3. Fetch the Code Changes (Diff)
    const { data: files } = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
      owner,
      repo,
      pull_number
    });

    // 4. Filter and process files
    const reviewableFiles = files.filter(file => {
      const filename = file.filename.toLowerCase();
      const hasIgnoredExt = IGNORED_EXTENSIONS.some(ext => filename.endsWith(ext));
      const hasIgnoredName = IGNORED_FILENAMES.some(ignoredName => filename.endsWith(ignoredName));
      return file.patch && !hasIgnoredExt && !hasIgnoredName;
    });

    if (reviewableFiles.length === 0) {
      console.log('No reviewable code changes found (only ignored files/lockfiles).');
      const commentBody = `🤖 **AI Code Review**\n\nNo reviewable source code changes found (only lockfiles, assets, or configuration files were modified). Looks clean! 🚀`;
      
      await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
        owner,
        repo,
        issue_number: pull_number,
        body: commentBody
      });

      return res.status(200).json({ success: true, message: 'No reviewable files found.' });
    }

    // Format code context for AI review
    // We also limit each patch length to 15,000 characters to prevent excessive tokens
    const MAX_PATCH_LENGTH = 15000;
    let codeContext = reviewableFiles.map(file => {
      let patch = file.patch;
      if (patch.length > MAX_PATCH_LENGTH) {
        patch = patch.substring(0, MAX_PATCH_LENGTH) + '\n\n[... Patch truncated due to size limit ...]';
      }
      return `File: ${file.filename}\n${patch}`;
    }).join('\n---\n');

    // Enforce overall DashScope prompt length limit of 30,720 characters (use 22,000 max for codeContext)
    const MAX_CONTEXT_LENGTH = 22000;
    if (codeContext.length > MAX_CONTEXT_LENGTH) {
      codeContext = codeContext.substring(0, MAX_CONTEXT_LENGTH) + '\n\n// [... Remainder of code changes truncated to fit model context limits ...]';
      console.log(`Truncated overall webhook review codeContext to ${codeContext.length} characters.`);
    }

    // 5. Send to Qwen for Analysis
    const prompt = `
You are a Senior Software Engineer reviewing a Pull Request.
Analyze the following code changes for bugs, security vulnerabilities, performance bottlenecks, and style violations.

Output strictly valid JSON with this schema:
{
  "issues": [
    {
      "file": "file_path.js",
      "line": 12,
      "type": "bug | security | performance | style",
      "message": "Detailed description of the issue and suggested fix."
    }
  ],
  "summary": "High-level summary of the overall changes, code quality, and key findings.",
  "auto_merge_safe": true
}

Notes:
- Set "auto_merge_safe" to true only if there are no bugs or security vulnerabilities, and code quality is high.
- If there are no issues, return an empty array for "issues".
- Ensure the JSON is properly escaped and valid. Do not wrap the JSON in Markdown formatting (e.g. \`\`\`json).

Code to review:
${codeContext}
`;

    const aiResponse = await qwen.chat.completions.create({
      model: 'qwen-max',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    });

    const responseText = aiResponse.choices[0].message.content.trim();
    let analysis;
    try {
      analysis = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse JSON from AI response. Raw response was:', responseText);
      // Fallback in case response is wrapped or malformed JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('AI response is not valid JSON.');
      }
    }

    // 6. Post Review Comment to GitHub
    const commentHeader = `🤖 **AI Code Review** for PR #${pull_number}\n\n`;
    const summaryBody = `### Summary\n${analysis.summary}\n\n`;
    
    let issuesBody = `### Issues Found\n`;
    if (analysis.issues && analysis.issues.length > 0) {
      issuesBody += analysis.issues.map(issue => {
        const typeEmoji = {
          bug: '🐛',
          security: '🔒',
          performance: '⚡',
          style: '🎨'
        }[issue.type] || '⚠️';
        return `- ${typeEmoji} **[${issue.type.toUpperCase()}]** \`${issue.file}\` (Line ${issue.line}): ${issue.message}`;
      }).join('\n');
    } else {
      issuesBody += `✨ No issues found! Code looks excellent and ready for merge.`;
    }

    const fullComment = commentHeader + summaryBody + issuesBody;

    await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
      owner,
      repo,
      issue_number: pull_number,
      body: fullComment
    });

    // 7. Auto-Label PR based on safety (wrap in try/catch to avoid breaking execution on label errors)
    if (analysis.auto_merge_safe) {
      try {
        await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
          owner,
          repo,
          issue_number: pull_number,
          labels: ['ai-approved']
        });
        console.log(`Labeled PR #${pull_number} as "ai-approved".`);
      } catch (labelError) {
        console.error('Error adding label to PR:', labelError.message);
      }
    }

    return res.status(200).json({ success: true, analysis });

  } catch (error) {
    console.error('Error handling webhook:', error);
    return res.status(500).json({ error: error.message });
  }
}
