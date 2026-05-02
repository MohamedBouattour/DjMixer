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
            // Auto-hide hint after 8 seconds
            setTimeout(() => setShowIOSHint(false), 8000);
        }
    };

    if (isStandalone) return null;
    if (!deferredPrompt && !isIOS) return null;

    return (
        <>
            <button
                className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9000] bg-gradient-to-br from-[#00d4ff] to-[#0056b3] text-white border-none px-5 py-2.5 rounded-[24px] text-[0.9rem] font-bold shadow-[0_4px_15px_rgba(0,212,255,0.4)] cursor-pointer flex items-center gap-2 animate-[fadeIn_0.5s_ease-out]"
                onClick={handleInstallClick}
                title="Install App"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Install App</span>
            </button>

            {showIOSHint && (
                <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-[rgba(20,20,20,0.95)] border border-[#333] rounded-xl p-4 z-[9001] w-[90%] max-w-[300px] text-center shadow-[0_10px_25px_rgba(0,0,0,0.5)] backdrop-blur-md">
                    <div className="mb-2.5 text-base font-bold text-white">Install on iOS</div>
                    <div className="text-[#ccc] text-[0.9rem] leading-[1.4]">
                        Tap the <strong className="text-[#00d4ff]">Share</strong> button <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline-block align-middle"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
                        <br />and select <strong className="text-white">"Add to Home Screen"</strong>
                    </div>
                    <div className="mt-2.5 w-0 h-0 border-x-[10px] border-x-transparent border-t-[10px] border-t-[rgba(20,20,20,0.95)] absolute -bottom-2.5 left-1/2 -translate-x-1/2" />
                </div>
            )}
        </>
    );
};
