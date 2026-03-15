import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const Root = import.meta.env.DEV ? React.StrictMode : React.Fragment;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <Root>
    <App />
  </Root>
);