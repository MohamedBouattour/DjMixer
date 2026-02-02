import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import './AuthModal.css';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const { login, register } = useAuth();
    const modalRef = useRef<HTMLDivElement>(null);

    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Reset form when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setEmail('');
            setPassword('');
            setUsername('');
            setConfirmPassword('');
            setError('');
            setMode('login');
        }
    }, [isOpen]);

    // Handle click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen && modalRef.current && !modalRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    // Handle escape key
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    const validateForm = (): boolean => {
        if (!email.trim() || !password.trim()) {
            setError('Email and password are required');
            return false;
        }

        if (!email.includes('@')) {
            setError('Please enter a valid email address');
            return false;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return false;
        }

        if (mode === 'register') {
            if (!username.trim()) {
                setError('Username is required');
                return false;
            }
            if (password !== confirmPassword) {
                setError('Passwords do not match');
                return false;
            }
        }

        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!validateForm()) return;

        setIsSubmitting(true);

        try {
            let result;
            if (mode === 'login') {
                result = await login(email, password);
            } else {
                result = await register(email, username, password);
            }

            if (result.success) {
                onSuccess?.();
                onClose();
            } else {
                setError(result.error || 'Authentication failed');
            }
        } catch (err) {
            setError('An unexpected error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const modalContent = (
        <div className="auth-modal-overlay">
            <div ref={modalRef} className="auth-modal">
                <button className="auth-close-btn" onClick={onClose}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                </button>

                <div className="auth-header">
                    <div className="auth-logo">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="url(#auth-gradient)">
                            <defs>
                                <linearGradient id="auth-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#00d9ff" />
                                    <stop offset="100%" stopColor="#ff00aa" />
                                </linearGradient>
                            </defs>
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                        </svg>
                    </div>
                    <h2 className="auth-title">
                        {mode === 'login' ? 'Welcome Back' : 'Create Account'}
                    </h2>
                    <p className="auth-subtitle">
                        {mode === 'login'
                            ? 'Sign in to access streaming features'
                            : 'Sign up to start mixing tracks'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {error && (
                        <div className="auth-error">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-2h2v2h-2zm0-4V7h2v6h-2z" />
                            </svg>
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="auth-field">
                        <label htmlFor="auth-email">Email</label>
                        <input
                            id="auth-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@email.com"
                            autoComplete="email"
                            disabled={isSubmitting}
                        />
                    </div>

                    {mode === 'register' && (
                        <div className="auth-field">
                            <label htmlFor="auth-username">Username</label>
                            <input
                                id="auth-username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="DJ Awesome"
                                autoComplete="username"
                                disabled={isSubmitting}
                            />
                        </div>
                    )}

                    <div className="auth-field">
                        <label htmlFor="auth-password">Password</label>
                        <input
                            id="auth-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                            disabled={isSubmitting}
                        />
                    </div>

                    {mode === 'register' && (
                        <div className="auth-field">
                            <label htmlFor="auth-confirm-password">Confirm Password</label>
                            <input
                                id="auth-confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="new-password"
                                disabled={isSubmitting}
                            />
                        </div>
                    )}

                    <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
                        {isSubmitting ? (
                            <span className="auth-spinner"></span>
                        ) : (
                            mode === 'login' ? 'Sign In' : 'Create Account'
                        )}
                    </button>
                </form>

                <div className="auth-footer">
                    <p>
                        {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
                        <button
                            type="button"
                            className="auth-switch-btn"
                            onClick={() => {
                                setMode(mode === 'login' ? 'register' : 'login');
                                setError('');
                            }}
                        >
                            {mode === 'login' ? 'Sign Up' : 'Sign In'}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(modalContent, document.body);
};
