'use client';

import { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed in standalone PWA mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    // Check if user dismissed prompt recently (do not nag every page refresh)
    const dismissedUntil = localStorage.getItem('ink-install-dismissed');
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) return;

    // Detect iOS Safari (which doesn't support beforeinstallprompt)
    const ua = window.navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(ua);
    const isSafari = isAppleDevice && /safari/.test(ua) && !/crios|fxios/.test(ua);

    if (isSafari) {
      setIsIOS(true);
      // Small timeout so it doesn't immediately interrupt initial view
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }

    // Android, Chrome, Edge, desktop PWA support
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show prompt after a short engagement delay
      setTimeout(() => setShowPrompt(true), 2000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    setShowPrompt(false);
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem('ink-installed', '1');
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Dismiss for 7 days
    localStorage.setItem('ink-install-dismissed', String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  };

  if (!showPrompt) return null;

  return (
    <aside
      aria-label="Install Inkognito"
      className="pwa-install-toast"
      role="dialog"
    >
      <div className="pwa-install-content">
        <div className="pwa-install-icon">
          <Download size={22} />
        </div>
        <div className="pwa-install-text">
          <div className="pwa-install-title">Install Inkognito</div>
          <div className="pwa-install-desc">
            {isIOS ? (
              <span>
                Tap <Share size={13} style={{ display: 'inline', verticalAlign: '-1px', margin: '0 2px' }} /> and choose <strong>Add to Home Screen</strong> for the full anonymous fullscreen experience.
              </span>
            ) : (
              'Add to home screen for instant access, offline reading, and a private fullscreen app.'
            )}
          </div>
        </div>
      </div>
      <div className="pwa-install-actions">
        {!isIOS && (
          <button className="btn sm pwa-install-btn" onClick={handleInstallClick}>
            Install
          </button>
        )}
        <button
          className="act pwa-install-close"
          onClick={handleDismiss}
          aria-label="Close install prompt"
        >
          <X size={18} />
        </button>
      </div>
    </aside>
  );
}
