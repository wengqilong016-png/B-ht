import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Analytics } from '@vercel/analytics/react';
import * as Sentry from '@sentry/react';
import './styles.css';
import App from './App';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.2,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.05,
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

const enableVercelAnalytics =
  import.meta.env.PROD &&
  import.meta.env.VITE_VERCEL_ANALYTICS_ENABLED === 'true';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const Root = import.meta.env.DEV ? React.StrictMode : React.Fragment;

ReactDOM.createRoot(rootElement).render(
  <Root>
    <QueryClientProvider client={queryClient}>
      <App />
      {enableVercelAnalytics ? <Analytics /> : null}
    </QueryClientProvider>
  </Root>
);
