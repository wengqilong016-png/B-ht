import { readEnv } from './_lib/readEnv';

const isLocalhostUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
  } catch {
    return false;
  }
};

export default {
  async fetch(request: Request) {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const statusApiBase = readEnv('STATUS_API_BASE', 'VITE_STATUS_API_BASE');
    const internalApiKey = readEnv('INTERNAL_API_KEY', 'VITE_INTERNAL_API_KEY');
    const vercelEnv = process.env.VERCEL_ENV || process.env.NODE_ENV;

    if (!statusApiBase || (vercelEnv === 'production' && isLocalhostUrl(statusApiBase))) {
      return new Response(null, { status: 204 });
    }

    const upstreamUrl = `${statusApiBase.replace(/\/$/, '')}/api/status`;
    const headers = new Headers();
    if (internalApiKey) {
      headers.set('X-API-KEY', internalApiKey);
    }

    try {
      const response = await fetch(upstreamUrl, {
        headers,
      });

      if (!response.ok) {
        const detail = await response.text();
        return Response.json(
          { error: 'Upstream status request failed', detail },
          { status: 502 },
        );
      }

      const data = await response.json();
      return Response.json(data, {
        headers: {
          'Cache-Control': 'no-store',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown status API error';
      return Response.json({ error: message }, { status: 502 });
    }
  },
};
