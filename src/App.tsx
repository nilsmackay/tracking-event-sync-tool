import { SyncProvider, useSyncContext } from './context/SyncContext';
import { UploadPage } from './components/UploadPage';
import { SyncPage } from './components/SyncPage';
import './index.css';

function AppContent() {
  const { isLoading, hasData } = useSyncContext();

  if (isLoading) {
    return (
      <div className="app loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {hasData ? <SyncPage /> : <UploadPage />}
    </div>
  );
}

function App() {
  return (
    <SyncProvider>
      <AppContent />
    </SyncProvider>
  );
}

export default App;
