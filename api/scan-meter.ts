import { SCAN_METER_ERROR_CODES } from '../types/scanMeter';

import { createAIClient, getVisionModel } from './_lib/aiClient.js';

const stripJsonFence = (value: string) =>
  value
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

const jsonError = (status: number, code: string, error: string) =>
  Response.json(
    { error, code },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return jsonError(405, SCAN_METER_ERROR_CODES.METHOD_NOT_ALLOWED, 'Method Not Allowed');
    }

    const aiConfig = createAIClient();
    if (!aiConfig) {
      return jsonError(503, SCAN_METER_ERROR_CODES.AI_NOT_CONFIGURED, 'AI scan service is not configured');
    }

    let body: { imageBase64?: string };
    try {
      body = await request.json();
    } catch {
      return jsonError(400, SCAN_METER_ERROR_CODES.INVALID_JSON_BODY, 'Invalid JSON body');
    }

    if (!body.imageBase64) {
      return jsonError(400, SCAN_METER_ERROR_CODES.MISSING_IMAGE_BASE64, 'Missing imageBase64');
    }

    try {
      const { client } = aiConfig;
      const visionModel = getVisionModel(aiConfig);
      const response = await client.chat.completions.create({
        model: visionModel,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${body.imageBase64}`, detail: 'low' },
              },
              {
                type: 'text',
                text: 'Analyze this vending machine counter image.\n1. Read the red 7-segment LED number.\n2. Check for screen damage or physical tampering.\nReturn JSON: {"score": "12345", "condition": "Normal" | "Damaged" | "Unclear", "notes": "Short observation"}',
              },
            ],
          },
        ],
      });

      const rawText = response.choices[0]?.message?.content?.trim();
      if (!rawText) {
        return jsonError(502, SCAN_METER_ERROR_CODES.EMPTY_AI_RESPONSE, 'Empty AI response');
      }

      let parsed: { score?: unknown; condition?: unknown; notes?: unknown };
      try {
        parsed = JSON.parse(stripJsonFence(rawText));
      } catch {
        return jsonError(502, SCAN_METER_ERROR_CODES.INVALID_AI_RESPONSE, 'Invalid AI JSON response');
      }

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
      return jsonError(502, SCAN_METER_ERROR_CODES.AI_UPSTREAM_ERROR, message);
    }
  },
};
