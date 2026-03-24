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
        <div className="modal-overlay-base auth-modal-overlay">
            <div ref={modalRef} className="modal-base auth-modal">
                <header className="modal-header-base auth-header">
                    <div className="auth-logo-section">
                        <h2 className="auth-title">
                            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
                        </h2>
                        <p className="auth-subtitle">
                            {mode === 'login'
                                ? 'Sign in to access streaming features'
                                : 'Sign up to start mixing tracks'}
                        </p>
                    </div>
                    <button className="icon-btn-close auth-close-btn" onClick={onClose}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                    </button>
                </header>

                <div className="auth-content">
                    <form onSubmit={handleSubmit} className="auth-form">
                        {error && (
                            <div className="auth-error">
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="auth-field">
                            <input
                                className="auth-input"
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
                                <input
                                    className="auth-input"
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
                            <input
                                className="auth-input"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Password (min 6 chars)"
                                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                disabled={isSubmitting}
                            />
                        </div>

                        {mode === 'register' && (
                            <div className="auth-field">
                                <input
                                    className="auth-input"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm Password"
                                    autoComplete="new-password"
                                    disabled={isSubmitting}
                                />
                            </div>
                        )}

                        <button type="submit" className="auth-submit" disabled={isSubmitting}>
                            {isSubmitting ? '...' : (mode === 'login' ? 'Sign In' : 'Create Account')}
                        </button>
                    </form>

                    <div className="auth-toggle">
                        <p>
                            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
                            {' '}
                            <span
                                className="auth-toggle-link"
                                onClick={() => {
                                    setMode(mode === 'login' ? 'register' : 'login');
                                    setError('');
                                }}
                            >
                                {mode === 'login' ? 'Sign Up' : 'Sign In'}
                            </span>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(modalContent, document.body);
};
