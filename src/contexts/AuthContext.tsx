import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface User {
    id: string;
    email: string;
    username: string;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
    register: (email: string, username: string, password: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'dj_mixer_auth';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Load user from localStorage on mount
    useEffect(() => {
        const loadUser = () => {
            try {
                const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
                if (savedAuth) {
                    const userData = JSON.parse(savedAuth);
                    setUser(userData);
                }
            } catch (error) {
                console.error('Failed to load auth state:', error);
                localStorage.removeItem(AUTH_STORAGE_KEY);
            } finally {
                setIsLoading(false);
            }
        };
        loadUser();
    }, []);

    const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
        try {
            // Call backend for authentication
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                const errorData = await response.json();
                return { success: false, error: errorData.error || 'Login failed' };
            }

            const userData = await response.json();
            setUser(userData);
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userData));
            return { success: true };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Connection failed. Please try again.' };
        }
    };

    const register = async (email: string, username: string, password: string): Promise<{ success: boolean; error?: string }> => {
        try {
            // Call backend for registration
            const response = await fetch('/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, username, password })
            });

            if (!response.ok) {
                const errorData = await response.json();
                return { success: false, error: errorData.error || 'Registration failed' };
            }

            const userData = await response.json();
            setUser(userData);
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userData));
            return { success: true };
        } catch (error) {
            console.error('Registration error:', error);
            return { success: false, error: 'Connection failed. Please try again.' };
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem(AUTH_STORAGE_KEY);
    };

    return (
        <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
