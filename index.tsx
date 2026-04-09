import * as Sentry from '@sentry/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Analytics } from '@vercel/analytics/react';
import React from 'react';
import ReactDOM from 'react-dom/client';

import './styles.css';
import App from './App';
import FRONTEND_ENV from './env';

if (FRONTEND_ENV.sentryDsn) {
  Sentry.init({
    dsn: FRONTEND_ENV.sentryDsn,
    environment: FRONTEND_ENV.mode,
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

const enableVercelAnalytics = FRONTEND_ENV.vercelAnalyticsEnabled;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const Root = FRONTEND_ENV.isDev ? React.StrictMode : React.Fragment;

ReactDOM.createRoot(rootElement).render(
  <Root>
    <QueryClientProvider client={queryClient}>
      <App />
      {enableVercelAnalytics ? <Analytics /> : null}
    </QueryClientProvider>
  </Root>
);
