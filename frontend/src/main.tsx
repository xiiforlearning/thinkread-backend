import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { setupWebApp } from './telegram/webapp';
import './ui/tokens.css';
import './ui/components.css';
import './ui/app.css';

setupWebApp();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
