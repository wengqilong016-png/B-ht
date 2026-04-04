import { GoogleGenAI } from '@google/genai';

const readEnv = (...names: string[]) => {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) {
      return value.trim();
    }
  }

  return '';
};

const stripJsonFence = (value: string) =>
  value
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const apiKey = readEnv('GEMINI_API_KEY', 'VITE_GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(null, { status: 204 });
    }

    let body: { imageBase64?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body.imageBase64) {
      return Response.json({ error: 'Missing imageBase64' }, { status: 400 });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: [{
          parts: [
            {
              inlineData: {
                data: body.imageBase64,
                mimeType: 'image/jpeg',
              },
            },
            {
              text: 'Analyze this vending machine counter image.\n1. Read the red 7-segment LED number.\n2. Check for screen damage or physical tampering.\nReturn JSON: {"score": "12345", "condition": "Normal" | "Damaged" | "Unclear", "notes": "Short observation"}',
            },
          ],
        }],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const rawText = response.text?.trim();
      if (!rawText) {
        return Response.json({ error: 'Empty AI response' }, { status: 502 });
      }

      const parsed = JSON.parse(stripJsonFence(rawText));
      return Response.json(
        {
          score: typeof parsed.score === 'string' ? parsed.score.replace(/\D/g, '') : '',
          condition: parsed.condition || 'Unclear',
          notes: parsed.notes || '',
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      return Response.json({ error: message }, { status: 502 });
    }
  },
};
