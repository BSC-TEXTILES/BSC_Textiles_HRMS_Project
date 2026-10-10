import React, { createContext, useContext, useState, useEffect } from 'react';
import { mobileApi, setAuthToken } from '../api/client';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isManagerOrHr: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  isManagerOrHr: false,
  login: async () => false,
  logout: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const isManagerOrHr = Boolean(
    user && ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'STORE_MANAGER', 'HUB_MANAGER'].includes(user.role)
  );

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await mobileApi.post('/auth/login', { email, password });
      const { token: receivedToken, user: receivedUser } = response.data;

      setToken(receivedToken);
      setUser(receivedUser);
      setAuthToken(receivedToken);
      return true;
    } catch (error: any) {
      console.error('[AuthContext] Login error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Authentication failed. Please verify credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setAuthToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, isManagerOrHr, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
