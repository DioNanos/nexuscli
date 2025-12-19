import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

// Token expiry: 7 days
const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing token on mount
    const storedToken = localStorage.getItem('nexuscli_token');
    const storedUser = localStorage.getItem('nexuscli_user');
    const tokenExpiry = localStorage.getItem('nexuscli_token_expiry');

    // Check if token has expired
    if (tokenExpiry && Date.now() > parseInt(tokenExpiry, 10)) {
      console.log('[Auth] Token expired, clearing session');
      localStorage.removeItem('nexuscli_token');
      localStorage.removeItem('nexuscli_user');
      localStorage.removeItem('nexuscli_token_expiry');
      setLoading(false);
      return;
    }

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await res.json();

    localStorage.setItem('nexuscli_token', data.token);
    localStorage.setItem('nexuscli_user', JSON.stringify(data.user));
    localStorage.setItem('nexuscli_token_expiry', String(Date.now() + TOKEN_EXPIRY_MS));

    setToken(data.token);
    setUser(data.user);

    return data;
  };

  const logout = () => {
    localStorage.removeItem('nexuscli_token');
    localStorage.removeItem('nexuscli_user');
    localStorage.removeItem('nexuscli_token_expiry');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
