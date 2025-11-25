import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './components/Login'
import Chat from './components/Chat'
import { useWakeLock } from './hooks/useWakeLock'
import './App.css'

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="App" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="App">
      {user ? <Chat /> : <Login />}
    </div>
  );
}

function App() {
  // Automatically manage wake lock for Termux/Android
  useWakeLock();

  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App
