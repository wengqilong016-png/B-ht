import React from 'react';

/**
 * Shown at startup when VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing
 * from the build environment.  This prevents a confusing blank/frozen screen.
 *
 * Fix:
 *   Local dev   → copy .env.example to .env.local and fill in your values
 *   Vercel      → Settings → Environment Variables → add both vars → Redeploy
 */
const EnvMissingErrorPage: React.FC = () => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f172a',
      color: '#f8fafc',
      padding: '2rem',
      textAlign: 'center',
      fontFamily: 'system-ui, sans-serif',
    }}
  >
    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔑</div>
    <h1 style={{ fontWeight: 900, fontSize: '1.25rem', marginBottom: '0.5rem' }}>
      Configuration Error
    </h1>
    <p style={{ color: '#94a3b8', fontSize: '0.875rem', maxWidth: '480px', marginBottom: '1.5rem', lineHeight: 1.6 }}>
      <strong style={{ color: '#fbbf24' }}>VITE_SUPABASE_URL</strong> or{' '}
      <strong style={{ color: '#fbbf24' }}>VITE_SUPABASE_ANON_KEY</strong> is missing.
      The app cannot connect to the database.
    </p>

    <div
      style={{
        background: '#1e293b',
        borderRadius: '0.75rem',
        padding: '1.25rem 1.5rem',
        maxWidth: '480px',
        textAlign: 'left',
        marginBottom: '1.5rem',
        border: '1px solid #334155',
      }}
    >
      <p style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.75rem' }}>
        How to fix
      </p>
      <ol style={{ paddingLeft: '1.25rem', margin: 0, color: '#cbd5e1', fontSize: '0.8125rem', lineHeight: 1.8 }}>
        <li>
          <strong>Local dev:</strong> copy{' '}
          <code style={{ background: '#0f172a', padding: '0 4px', borderRadius: '4px' }}>.env.example</code> to{' '}
          <code style={{ background: '#0f172a', padding: '0 4px', borderRadius: '4px' }}>.env.local</code> and fill in your Supabase URL and anon key.
        </li>
        <li>
          <strong>Vercel:</strong> go to <em>Settings → Environment Variables</em>, add{' '}
          <code style={{ background: '#0f172a', padding: '0 4px', borderRadius: '4px' }}>VITE_SUPABASE_URL</code> and{' '}
          <code style={{ background: '#0f172a', padding: '0 4px', borderRadius: '4px' }}>VITE_SUPABASE_ANON_KEY</code>, then redeploy.
        </li>
        <li>
          Find the values in your Supabase Dashboard under <em>Settings → API</em>.
        </li>
      </ol>
    </div>

    <p style={{ color: '#475569', fontSize: '0.6875rem' }}>
      See <code style={{ background: '#1e293b', padding: '0 4px', borderRadius: '4px' }}>.env.example</code> and{' '}
      <code style={{ background: '#1e293b', padding: '0 4px', borderRadius: '4px' }}>docs/DEPLOYMENT.md</code> for full details.
    </p>
  </div>
);

export default EnvMissingErrorPage;
