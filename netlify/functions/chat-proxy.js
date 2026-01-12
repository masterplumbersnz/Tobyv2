const fetch = require('node-fetch');

exports.handler = async (event) => {
  const ALLOWED_ORIGINS = [
    'https://masterplumbers.org.nz',
    'https://tobyv2.netlify.app',
    'https://tobyversion2.netlify.app',
  ];

  const origin = event.headers.origin;
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  const corsHeaders = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  try {
    const { message, thread_id } = JSON.parse(event.body || '{}');

    if (!message) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing message' }),
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const assistantId = process.env.OPENAI_ASSISTANT_ID;

    if (!apiKey || !assistantId) {
      throw new Error('Missing OPENAI_API_KEY or OPENAI_ASSISTANT_ID');
    }

    // Create or reuse thread
    let threadId = thread_id;
    if (!threadId) {
      const threadRes = await fetch('https://api.openai.com/v1/threads', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'OpenAI-Beta': 'assistants=v2',
          'Content-Type': 'application/json',
        },
      });
      const thread = await threadRes.json();
      threadId = thread.id;
    }

    // Post user message
    await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'OpenAI-Beta': 'assistants=v2',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'user', content: message }),
    });

    // Start run
    const runRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'OpenAI-Beta': 'assistants=v2',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assistant_id: assistantId }),
    });

    const run = await runRes.json();

    // Poll until complete
    let status = run.status;
    while (status === 'queued' || status === 'in_progress') {
      await new Promise((r) => setTimeout(r, 1200));
      const pollRes = await fetch(
        `https://api.openai.com/v1/threads/${threadId}/runs/${run.id}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'OpenAI-Beta': 'assistants=v2',
          },
        }
      );
      const poll = await pollRes.json();
      status = poll.status;
    }

    // Fetch messages
    const messagesRes = await fetch(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'OpenAI-Beta': 'assistants=v2',
        },
      }
    );

    const messages = await messagesRes.json();

    const assistantMsg = messages.data.find(
      (m) => m.role === 'assistant'
    );

    const reply =
      assistantMsg?.content
        ?.filter((c) => c.type === 'output_text')
        ?.map((c) => c.text.value)
        ?.join('\n') || '(No response)';

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ reply, thread_id: threadId }),
    };
  } catch (error) {
    console.error('chat-proxy error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
