import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { MediaStreamProvider } from './context/MediaStreamContext.tsx';
import { LiveKitProvider } from './context/LiveKitContext.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <MediaStreamProvider>
          <LiveKitProvider>
            <App />
          </LiveKitProvider>
        </MediaStreamProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
