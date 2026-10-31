import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@fontsource-variable/inter/opsz.css';
import '@mantine/core/styles.css';
import './styles.css';
import { cssVariablesResolver, theme } from './theme';
import { AppProvider } from './state';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} defaultColorScheme="auto">
      <AppProvider>
        <App />
      </AppProvider>
    </MantineProvider>
  </StrictMode>,
);
