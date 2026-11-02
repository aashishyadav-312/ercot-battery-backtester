import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/dm-sans';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import '@mantine/core/styles.css';
import './styles/tokens.css';
import './styles.css';
import { cssVariablesResolver, theme } from './theme';
import { AppProvider } from './state';
import { SchemeProvider, useScheme } from './components/shell/SchemeProvider';
import App from './App';

/** Mantine follows the scheme SchemeProvider resolved, so the tokens and Mantine never disagree. */
function Themed({ children }: { children: ReactNode }) {
  const { scheme } = useScheme();
  return <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} forceColorScheme={scheme}>{children}</MantineProvider>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SchemeProvider>
      <Themed>
        <AppProvider>
          <App />
        </AppProvider>
      </Themed>
    </SchemeProvider>
  </StrictMode>,
);
