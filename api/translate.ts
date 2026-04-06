import { readEnv } from './_lib/readEnv';

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const apiKey = readEnv('GOOGLE_TRANSLATE_API_KEY', 'GEMINI_API_KEY', 'VITE_GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(null, { status: 204 });
    }

    let body: { text?: string; target?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const text = body.text?.trim();
    if (!text) {
      return Response.json({ error: 'Missing text' }, { status: 400 });
    }

    const target = body.target?.trim() || 'zh';
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: text,
        target,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json(
        { error: 'Upstream translation request failed', detail: errorText },
        { status: 502 },
      );
    }

    const data = await response.json();
    const translatedText = data?.data?.translations?.[0]?.translatedText;

    return Response.json(
      { translatedText: translatedText || text },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  },
};
