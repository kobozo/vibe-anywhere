'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';

interface User {
  id: string;
  username: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AUTH_STORAGE_KEY = 'vibe-anywhere-auth';

export function useAuthState(): AuthContextValue {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Load auth state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const { user, token } = parsed;

        // Validate that we have valid user and token
        if (user && token && typeof token === 'string') {
          // Ensure auth_token is also set for direct API access
          localStorage.setItem('auth_token', token);
          setState({
            user,
            token,
            isLoading: false,
            isAuthenticated: true,
          });
        } else {
          // Invalid stored data, clear it
          localStorage.removeItem(AUTH_STORAGE_KEY);
          localStorage.removeItem('auth_token');
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      } else {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    } catch {
      // Any error - clear storage and set loading to false
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem('auth_token');
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error?.message || 'Login failed');
    }

    const { data } = await response.json();
    const { user, token } = data;

    // Store in localStorage
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user, token }));
    // Also store token separately for direct access by API calls
    localStorage.setItem('auth_token', token);

    setState({
      user,
      token,
      isLoading: false,
      isAuthenticated: true,
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem('auth_token');
    setState({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  return {
    ...state,
    login,
    logout,
  };
}

// Context for providing auth state
const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = AuthContext.Provider;

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
