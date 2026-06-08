import { OpenAI } from 'openai';

// Setup Qwen (Alibaba Cloud) via OpenAI-compatible SDK
const qwen = new OpenAI({
  apiKey: process.env.QWEN_API_KEY || 'dummy-qwen-key-for-local-boot',
  baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  fetch: (...args) => globalThis.fetch(...args)
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { code, filename } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'No code provided for review.' });
  }

  console.log(`Analyzing file "${filename || 'unnamed'}" on-demand...`);

  try {
    const prompt = `
You are an expert Senior Software Engineer and Security Auditor.
Analyze the following source code file named "${filename || 'code.txt'}" for bugs, vulnerabilities, style violations, and performance issues.

Provide your review in valid JSON format.
Your output MUST be strictly valid JSON with this exact schema (no markdown wrappers like \`\`\`json):
{
  "score": 85,
  "summary": "Overall summary of the code quality and findings.",
  "issues": [
    {
      "line": 3,
      "type": "bug | security | performance | style",
      "message": "Detailed issue description.",
      "fix": "Suggested code replacement or inline fix."
    }
  ],
  "fixedCode": "Full corrected source code here, with all identified issues resolved. Keep comments and structure intact."
}

Code to review:
\`\`\`
${code}
\`\`\`
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
      console.error('Failed to parse JSON from AI response:', responseText);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('AI review did not return valid JSON.');
      }
    }

    return res.status(200).json({ success: true, analysis });

  } catch (error) {
    console.error('Error in upload-review api:', error);
    return res.status(500).json({ error: error.message });
  }
}
