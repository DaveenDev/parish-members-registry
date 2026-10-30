import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ThemeProvider } from './ThemeContext.jsx';
import { ToastProvider } from './ToastContext.jsx';
import { ConfirmProvider } from './components/ConfirmDialog.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { reloadForNewCode } from './lib/chunkReload.js';
import './index.css';

// A page's code (or its CSS) failed to download before it was needed: after a
// deploy while the site was open, its old files are gone. Reload once for the
// new ones instead of showing an error (Vite fires this for dynamic imports).
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewCode()) event.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
