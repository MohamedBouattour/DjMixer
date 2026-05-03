import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { API_ENDPOINTS } from '../config';

interface User {
    id: string;
    email: string;
    username: string;
    picture?: string;
    token?: string;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
    register: (email: string, username: string, password: string) => Promise<{ success: boolean; error?: string }>;
    googleLogin: (accessToken: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'dj_mixer_auth';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Restore session from localStorage
    useEffect(() => {
        try {
            const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
            if (savedAuth) setUser(JSON.parse(savedAuth));
        } catch {
            localStorage.removeItem(AUTH_STORAGE_KEY);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const persistUser = (userData: User) => {
        setUser(userData);
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userData));
    };

    const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
        try {
            const res = await fetch(`${API_ENDPOINTS.AUTH}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            if (!res.ok) {
                const e = await res.json();
                return { success: false, error: e.error || 'Login failed' };
            }
            persistUser(await res.json());
            return { success: true };
        } catch {
            return { success: false, error: 'Connection failed. Please try again.' };
        }
    };

    const register = async (email: string, username: string, password: string): Promise<{ success: boolean; error?: string }> => {
        try {
            const res = await fetch(`${API_ENDPOINTS.AUTH}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, username, password })
            });
            if (!res.ok) {
                const e = await res.json();
                return { success: false, error: e.error || 'Registration failed' };
            }
            persistUser(await res.json());
            return { success: true };
        } catch {
            return { success: false, error: 'Connection failed. Please try again.' };
        }
    };

    // Accepts either a Google JWT credential or an access_token.
    const googleLogin = async (token: string): Promise<{ success: boolean; error?: string }> => {
        try {
            let body: any = {};
            
            // Check if token is a JWT (ID Token) by looking for dots
            if (token.includes('.')) {
                body = { credential: token };
            } else {
                // It's an access token from the hook flow
                const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!infoRes.ok) return { success: false, error: 'Failed to fetch Google profile' };
                const info = await infoRes.json();
                body = { sub: info.sub, email: info.email, name: info.name, picture: info.picture };
            }

            const res = await fetch(`${API_ENDPOINTS.AUTH}/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            
            if (!res.ok) {
                const e = await res.json();
                return { success: false, error: e.error || 'Google Login failed' };
            }
            persistUser(await res.json());
            return { success: true };
        } catch {
            return { success: false, error: 'Connection failed. Please try again.' };
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem(AUTH_STORAGE_KEY);
    };

    return (
        <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, register, googleLogin, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
