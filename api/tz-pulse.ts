import { createClient } from '@supabase/supabase-js';

import { readEnv } from './_lib/readEnv.js';

export default {
  async fetch(request: Request) {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const supabaseUrl = readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
    const supabaseAnonKey = readEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseAnonKey) {
      return Response.json({ error: 'Supabase is not configured' }, { status: 503 });
    }

    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

    const [snapshotResult, articlesResult, weekResult] = await Promise.all([
      client.from('tz_pulse_snapshots').select('*').eq('date', today).maybeSingle(),
      client.from('tz_pulse_articles').select('*').gte('created_at', today).order('created_at', { ascending: false }),
      client.from('tz_pulse_snapshots').select('date,highlights').gte('date', weekAgo).order('date', { ascending: false }),
    ]);

    const error = snapshotResult.error || articlesResult.error || weekResult.error;
    if (error) {
      return Response.json({ error: error.message }, { status: 502 });
    }

    return Response.json(
      {
        snap: snapshotResult.data,
        articles: articlesResult.data ?? [],
        week: weekResult.data ?? [],
      },
      { headers: { 'Cache-Control': 'private, max-age=300' } },
    );
  },
};
