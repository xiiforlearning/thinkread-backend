import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/tokens.css';
import '../ui/components.css';
import '../ui/app.css';
import '../ui/admin.css';
import App from './App';

// The design tokens switch on `data-theme`; the dashboard follows the system scheme.
const scheme = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = (): void =>
  document.documentElement.setAttribute('data-theme', scheme.matches ? 'dark' : 'light');
applyTheme();
scheme.addEventListener('change', applyTheme);

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
