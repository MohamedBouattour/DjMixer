import React, { useState, useEffect } from 'react';

// Interface for beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPWA: React.FC = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const [showIOSHint, setShowIOSHint] = useState(false);

    useEffect(() => {
        // Check if already in standalone mode
        const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as any).standalone === true;
        setIsStandalone(isStandaloneMode);

        if (isStandaloneMode) return;

        // Check for iOS
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
        setIsIOS(isIosDevice);

        // Listen for beforeinstallprompt (Android/Chrome)
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const choiceResult = await deferredPrompt.userChoice;
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
                setDeferredPrompt(null);
            } else {
                console.log('User dismissed the install prompt');
            }
        } else if (isIOS) {
            setShowIOSHint(true);
            // Auto-hide hint after 5 seconds
            setTimeout(() => setShowIOSHint(false), 8000);
        }
    };

    if (isStandalone) return null;
    if (!deferredPrompt && !isIOS) return null;

    return (
        <>
            <button
                className="install-pwa-btn"
                onClick={handleInstallClick}
                title="Install App"
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 9000,
                    background: 'linear-gradient(135deg, #00d4ff 0%, #0056b3 100%)',
                    color: 'white',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '24px',
                    fontSize: '0.9rem',
                    fontWeight: 'bold',
                    boxShadow: '0 4px 15px rgba(0, 212, 255, 0.4)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    animation: 'fadeIn 0.5s ease-out'
                }}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Install App</span>
            </button>

            {showIOSHint && (
                <div style={{
                    position: 'fixed',
                    bottom: '80px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(20, 20, 20, 0.95)',
                    border: '1px solid #333',
                    borderRadius: '12px',
                    padding: '16px',
                    zIndex: 9001,
                    width: '90%',
                    maxWidth: '300px',
                    textAlign: 'center',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(10px)'
                }}>
                    <div style={{ marginBottom: '10px', fontSize: '1rem', fontWeight: 'bold' }}>Install on iOS</div>
                    <div style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: '1.4' }}>
                        Tap the <strong style={{ color: '#00d4ff' }}>Share</strong> button <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle' }}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
                        <br />and select <strong style={{ color: '#fff' }}>"Add to Home Screen"</strong>
                    </div>
                    <div style={{
                        marginTop: '10px',
                        width: '0',
                        height: '0',
                        borderLeft: '10px solid transparent',
                        borderRight: '10px solid transparent',
                        borderTop: '10px solid rgba(20, 20, 20, 0.95)',
                        position: 'absolute',
                        bottom: '-10px',
                        left: '50%',
                        transform: 'translateX(-50%)'
                    }} />
                </div>
            )}
        </>
    );
};
