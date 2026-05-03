import React, { useRef, useEffect, useState } from 'react';
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
    const { googleLogin } = useAuth();
    const modalRef = useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // Reset on open
    useEffect(() => {
        if (isOpen) {
            setError('');
            setIsLoading(false);
        }
    }, [isOpen]);

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen && modalRef.current && !modalRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    // Escape key to close
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isOpen) onClose();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    // useGoogleLogin with implicit flow + popup — works on iOS Safari
    const signInWithGoogle = useGoogleLogin({
        flow: 'implicit',
        onSuccess: async (tokenResponse) => {
            setIsLoading(true);
            setError('');
            try {
                const result = await googleLogin(tokenResponse.access_token);
                if (result.success) {
                    onSuccess?.();
                    onClose();
                } else {
                    setError(result.error || 'Google sign-in failed. Please try again.');
                }
            } finally {
                setIsLoading(false);
            }
        },
        onError: () => {
            setError('Google sign-in was cancelled or failed. Please try again.');
            setIsLoading(false);
        },
        onNonOAuthError: (err) => {
            // Popup was blocked or closed
            if (err.type === 'popup_closed') {
                setError('');
            } else {
                setError('Could not open sign-in window. Please allow popups and try again.');
            }
            setIsLoading(false);
        },
    });

    const handleGoogleSignIn = () => {
        setError('');
        setIsLoading(true);
        signInWithGoogle();
    };

    if (!isOpen) return null;

    const modalContent = (
        <div className={sharedStyles.modalOverlay}>
            <div
                ref={modalRef}
                className={cn(sharedStyles.modalBase, 'max-w-[90vw] w-[360px] max-md:w-[95vw]')}
            >
                {/* Header */}
                <header className={cn(sharedStyles.modalHeader, 'text-center justify-center relative')}>
                    <div className="flex flex-col items-center gap-1 w-full">
                        {/* DJ icon */}
                        <div className="w-12 h-12 rounded-full bg-deck-a/10 border border-deck-a/30 flex items-center justify-center mb-1">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-deck-a">
                                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                            </svg>
                        </div>
                        <h2 className="text-[18px] font-bold text-white m-0">Sign in to DJ Pro</h2>
                        <p className="text-[12px] text-text-hint m-0">Save your library across all devices</p>
                    </div>
                    <button
                        className={cn(sharedStyles.iconBtnClose, 'absolute top-0 right-0')}
                        onClick={onClose}
                        aria-label="Close"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                    </button>
                </header>

                {/* Body */}
                <div className="p-6 max-md:p-5 flex flex-col items-center gap-4">
                    {error && (
                        <div className="w-full bg-accent-red/10 border border-accent-red rounded-md p-3 text-[12px] text-[#ff6666] text-center">
                            {error}
                        </div>
                    )}

                    {/* Single Google Sign-In Button */}
                    <button
                        id="google-signin-btn"
                        onClick={handleGoogleSignIn}
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-3 h-12 bg-white text-[#1f1f1f] font-semibold text-[14px] rounded-xl border border-white/20 shadow-lg transition-all duration-200 hover:bg-gray-100 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
                    >
                        {isLoading ? (
                            <>
                                <svg
                                    className="animate-spin"
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="#1f1f1f"
                                    strokeWidth="2.5"
                                >
                                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                                    <path d="M12 2a10 10 0 0 1 10 10" />
                                </svg>
                                <span>Signing in…</span>
                            </>
                        ) : (
                            <>
                                {/* Google "G" logo */}
                                <svg width="20" height="20" viewBox="0 0 48 48">
                                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                                </svg>
                                <span>Continue with Google</span>
                            </>
                        )}
                    </button>

                    <p className="text-[11px] text-text-muted text-center leading-relaxed">
                        By signing in, you agree to sync your track library across devices.
                        No account creation required.
                    </p>
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(modalContent, document.body);
};
