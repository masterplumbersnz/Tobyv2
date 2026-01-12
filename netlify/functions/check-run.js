const fetch = require('node-fetch');

exports.handler = async (event) => {
  const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

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
    const { thread_id, run_id } = JSON.parse(event.body || '{}');
    const apiKey = process.env.OPENAI_API_KEY;

    if (!thread_id || !run_id || !apiKey) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
        body: JSON.stringify({ error: 'Missing thread_id, run_id, or API key.' }),
      };
    }

    // 1️⃣ Check run status
    const runRes = await fetch(
      `https://api.openai.com/v1/threads/${thread_id}/runs/${run_id}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'OpenAI-Beta': 'assistants=v2',
        },
      }
    );

    if (!runRes.ok) {
      throw new Error(await runRes.text());
    }

    const run = await runRes.json();

    // If still running, tell frontend to keep polling
    if (run.status !== 'completed') {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
        body: JSON.stringify({ status: run.status }),
      };
    }

    // 2️⃣ Fetch messages
    const msgRes = await fetch(
      `https://api.openai.com/v1/threads/${thread_id}/messages`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'OpenAI-Beta': 'assistants=v2',
        },
      }
    );

    if (!msgRes.ok) {
      throw new Error(await msgRes.text());
    }

    const messages = await msgRes.json();

    // 3️⃣ Get latest assistant message
    const assistantMessage = messages.data.find(
      (m) => m.role === 'assistant'
    );

    const text =
      assistantMessage?.content?.[0]?.text?.value || '(No Response)';

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'completed',
        response: text,
      }),
    };
  } catch (error) {
    console.error('check-run error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
