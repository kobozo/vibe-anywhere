'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';

interface User {
  id: string;
  username: string;
  createdAt: number;
  updatedAt: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  forcePasswordChange: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  changePassword: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ) => Promise<{ message: string }>;
}

const AUTH_STORAGE_KEY = 'vibe-anywhere-auth';

export function useAuthState(): AuthContextValue {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    forcePasswordChange: false,
    isLoading: true,
    isAuthenticated: false,
  });

  // Load auth state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const { user, token, forcePasswordChange } = parsed;

        // Validate that we have valid user and token
        if (user && token && typeof token === 'string') {
          // Ensure auth_token is also set for direct API access
          localStorage.setItem('auth_token', token);
          setState({
            user,
            token,
            forcePasswordChange: Boolean(forcePasswordChange),
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
    const { user, token, forcePasswordChange } = data;

    // Ensure forcePasswordChange is a boolean
    const forcePasswordChangeBool = Boolean(forcePasswordChange);

    // Store in localStorage
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user, token, forcePasswordChange: forcePasswordChangeBool }));
    // Also store token separately for direct access by API calls
    localStorage.setItem('auth_token', token);

    setState({
      user,
      token,
      forcePasswordChange: forcePasswordChangeBool,
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
      forcePasswordChange: false,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string, confirmPassword: string) => {
      if (!state.token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Password change failed');
      }

      const { data } = await response.json();

      // Update state to set forcePasswordChange to false
      setState((prev) => ({
        ...prev,
        forcePasswordChange: false,
      }));

      // Update localStorage
      try {
        const stored = localStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          localStorage.setItem(
            AUTH_STORAGE_KEY,
            JSON.stringify({ ...parsed, forcePasswordChange: false })
          );
        }
      } catch {
        // Best-effort only; in-memory state already updated.
      }

      return data;
    },
    [state.token]
  );

  return {
    ...state,
    login,
    logout,
    changePassword,
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
