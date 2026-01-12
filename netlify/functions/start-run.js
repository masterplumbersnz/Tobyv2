const fetch = require('node-fetch');

exports.handler = async (event) => {
  const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
        body: JSON.stringify({ error: 'Missing request body.' }),
      };
    }

    const { message, thread_id } = JSON.parse(event.body);

    const apiKey = process.env.OPENAI_API_KEY;
    const assistantId = process.env.OPENAI_ASSISTANT_ID;

    if (!message || !apiKey || !assistantId) {
      console.error('Missing message or environment variables', {
        message,
        apiKey: !!apiKey,
        assistantId: !!assistantId,
      });
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
        body: JSON.stringify({ error: 'Missing message, assistant ID, or API key.' }),
      };
    }

    // Create thread if not provided
    let threadRes = { id: thread_id };
    if (!thread_id) {
      const createThreadRes = await fetch('https://api.openai.com/v1/threads', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'OpenAI-Beta': 'assistants=v2',
          'Content-Type': 'application/json',
        },
      });

      if (!createThreadRes.ok) {
        const text = await createThreadRes.text();
        throw new Error(`Thread creation failed: ${text}`);
      }

      threadRes = await createThreadRes.json();
    }

    // Post user message
    const msgPostRes = await fetch(`https://api.openai.com/v1/threads/${threadRes.id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'OpenAI-Beta': 'assistants=v2',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'user', content: message }),
    });

    if (!msgPostRes.ok) {
      const text = await msgPostRes.text();
      throw new Error(`Message post failed: ${text}`);
    }

    // Create run
    const runPostRes = await fetch(`https://api.openai.com/v1/threads/${threadRes.id}/runs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'OpenAI-Beta': 'assistants=v2',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assistant_id: assistantId }),
    });

    if (!runPostRes.ok) {
      const text = await runPostRes.text();
      throw new Error(`Run creation failed: ${text}`);
    }

    const runRes = await runPostRes.json();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ thread_id: threadRes.id, run_id: runRes.id }),
    };
  } catch (error) {
    console.error('start-run error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      body: JSON.stringify({ error: error.message || 'Internal server error' }),
    };
  }
};
