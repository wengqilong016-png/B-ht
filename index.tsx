import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './styles.css';
import App from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const Root = import.meta.env.DEV ? React.StrictMode : React.Fragment;

ReactDOM.createRoot(rootElement).render(
  <Root>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </Root>
);