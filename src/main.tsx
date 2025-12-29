import React from 'react';
import ReactDOM from 'react-dom/client';
import AppRouter from './app/AppRouter';
// import { registerPwa } from './app/pwa'; // PWAは後ほど有効化

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);
