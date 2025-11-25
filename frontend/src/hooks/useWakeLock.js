import { useEffect } from 'react';

/**
 * Custom hook to manage wake lock on Termux/Android
 * Automatically acquires wake lock when app goes to background
 * Releases wake lock when app returns to foreground
 */
export function useWakeLock() {
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        // App went to background - acquire wake lock
        console.log('[WakeLock] App went to background, acquiring wake lock...');

        try {
          const response = await fetch(`/api/v1/wake-lock`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            }
          });

          const data = await response.json();

          if (data.status === 'ok') {
            console.log('[WakeLock] ✅ Wake lock acquired');
          } else {
            console.warn('[WakeLock] ⚠️ Failed to acquire wake lock:', data.message);
          }
        } catch (err) {
          console.error('[WakeLock] ❌ Error acquiring wake lock:', err);
        }
      } else {
        // App returned to foreground - optionally release wake lock
        console.log('[WakeLock] App returned to foreground');

        // Keep wake lock active even in foreground
        // If you want to release it, uncomment below:
        /*
        try {
          const response = await fetch(`/api/v1/wake-lock`, {
            method: 'DELETE'
          });

          const data = await response.json();

          if (data.status === 'ok') {
            console.log('[WakeLock] ✅ Wake lock released');
          }
        } catch (err) {
          console.error('[WakeLock] ❌ Error releasing wake lock:', err);
        }
        */
      }
    };

    // Add event listener for visibility change
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Acquire wake lock on mount (app startup)
    const acquireOnMount = async () => {
      console.log('[WakeLock] App mounted, acquiring wake lock...');

      try {
        const response = await fetch(`/api/v1/wake-lock`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();

        if (data.status === 'ok') {
          console.log('[WakeLock] ✅ Wake lock acquired on startup');
        }
      } catch (err) {
        console.error('[WakeLock] ❌ Error acquiring wake lock on startup:', err);
      }
    };

    acquireOnMount();

    // Cleanup listener on unmount
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
