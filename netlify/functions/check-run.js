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

    const { thread_id } = JSON.parse(event.body);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!thread_id || !apiKey) {
      console.error('Missing thread_id or API key', { thread_id, apiKey: !!apiKey });
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
        body: JSON.stringify({ error: 'Missing thread ID or API key.' }),
      };
    }

    // Fetch the run or thread status
    const res = await fetch(`https://api.openai.com/v1/threads/${thread_id}/runs`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'OpenAI-Beta': 'assistants=v2',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Fetch run failed: ${text}`);
    }

    const data = await res.json();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error('check-run error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      body: JSON.stringify({ error: error.message || 'Internal server error' }),
    };
  }
};
