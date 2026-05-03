import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../utils/cn';
import { sharedStyles } from '../utils/sharedStyles';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const { login, register, googleLogin } = useAuth();
    const modalRef = useRef<HTMLDivElement>(null);

    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);

    const handleGoogleSuccess = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            setIsGoogleLoading(true);
            setError('');
            try {
                // Exchange access token for a user credential the backend can verify
                const result = await googleLogin(tokenResponse.access_token);
                if (result.success) { onSuccess?.(); onClose(); }
                else setError(result.error || 'Google sign-in failed');
            } catch { setError('Google sign-in failed'); }
            finally { setIsGoogleLoading(false); }
        },
        onError: () => setError('Google sign-in was cancelled or failed'),
        flow: 'implicit',
    });

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
        <div className={sharedStyles.modalOverlay}>
            <div ref={modalRef} className={cn(sharedStyles.modalBase, "max-w-[90vw] w-[380px] max-md:w-[95vw]")}>
                <header className={cn(sharedStyles.modalHeader, "text-left max-md:p-4")}>
                    <div className="flex flex-col">
                        <h2 className="text-[18px] font-bold text-white m-0 mb-1">
                            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
                        </h2>
                        <p className="text-[13px] text-text-hint m-0">
                            {mode === 'login'
                                ? 'Sign in to access streaming features'
                                : 'Sign up to start mixing tracks'}
                        </p>
                    </div>
                    <button className={sharedStyles.iconBtnClose} onClick={onClose}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                    </button>
                </header>

                <div className="p-6 max-md:p-4">
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        {error && (
                            <div className="bg-accent-red/10 border border-accent-red rounded-md p-3.5 text-[13px] text-[#ff6666] mb-3">
                                <span>{error}</span>
                            </div>
                        )}

                        <div>
                            <input
                                className="w-full h-11 bg-bg-header border border-white/10 rounded-lg px-3.5 text-sm text-white transition-all duration-150 focus:border-deck-a focus:outline-none placeholder:text-text-muted disabled:opacity-50"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="your@email.com"
                                autoComplete="email"
                                disabled={isSubmitting}
                            />
                        </div>

                        {mode === 'register' && (
                            <div>
                                <input
                                    className="w-full h-11 bg-bg-header border border-white/10 rounded-lg px-3.5 text-sm text-white transition-all duration-150 focus:border-deck-a focus:outline-none placeholder:text-text-muted disabled:opacity-50"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="DJ Awesome"
                                    autoComplete="username"
                                    disabled={isSubmitting}
                                />
                            </div>
                        )}

                        <div>
                            <input
                                className="w-full h-11 bg-bg-header border border-white/10 rounded-lg px-3.5 text-sm text-white transition-all duration-150 focus:border-deck-a focus:outline-none placeholder:text-text-muted disabled:opacity-50"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Password (min 6 chars)"
                                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                disabled={isSubmitting}
                            />
                        </div>

                        {mode === 'register' && (
                            <div>
                                <input
                                    className="w-full h-11 bg-bg-header border border-white/10 rounded-lg px-3.5 text-sm text-white transition-all duration-150 focus:border-deck-a focus:outline-none placeholder:text-text-muted disabled:opacity-50"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm Password"
                                    autoComplete="new-password"
                                    disabled={isSubmitting}
                                />
                            </div>
                        )}

                        <button 
                            type="submit" 
                            className="w-full h-11 bg-gradient-to-br from-deck-a to-deck-b border-none rounded-lg text-sm font-bold text-white cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(255,0,128,0.5)] disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none" 
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? '...' : (mode === 'login' ? 'Sign In' : 'Create Account')}
                        </button>

                        {/* Divider */}
                        <div className="flex items-center gap-3 my-1">
                            <div className="flex-1 h-px bg-white/10" />
                            <span className="text-[11px] text-text-muted uppercase tracking-widest">or</span>
                            <div className="flex-1 h-px bg-white/10" />
                        </div>

                        {/* Google Sign-In */}
                        <button
                            type="button"
                            onClick={() => handleGoogleSuccess()}
                            disabled={isGoogleLoading || isSubmitting}
                            className="w-full h-11 bg-white/5 border border-white/10 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-3 transition-all duration-150 hover:bg-white/10 hover:border-white/25 hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
                        >
                            {isGoogleLoading ? (
                                <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                            ) : (
                                <svg width="18" height="18" viewBox="0 0 48 48">
                                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                                </svg>
                            )}
                            {isGoogleLoading ? 'Connecting…' : 'Continue with Google'}
                        </button>
                    </form>

                    <div className="mt-4 text-center text-[13px] text-text-hint">
                        <p>
                            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
                            {' '}
                            <span
                                className="text-deck-b cursor-pointer font-semibold hover:underline"
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
