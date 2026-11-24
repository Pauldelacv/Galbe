import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { initSession, startAutosave } from './persistence/session.ts';
import { useDocumentStore } from './state/documentStore.ts';
import { usePlaybackStore } from './state/playbackStore.ts';
import './styles/global.css';

// Debug / end-to-end testing handles (no API guarantees).
Object.assign((globalThis as Record<string, unknown>).__galbe as object, {
  documentStore: useDocumentStore,
  playbackStore: usePlaybackStore,
});

async function boot() {
  try {
    await initSession();
  } catch (error) {
    console.error('[galbe] could not open local storage; working in memory only', error);
  }
  startAutosave();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
