import { useState } from 'react';

/**
 * Tracks whether Caps Lock is on, from key events on a password field. A
 * caps-lock-garbled guess still counts as a wrong password wherever this
 * app throttles login/password attempts, so this is worth wiring into every
 * password field, not just the login form.
 */
export function useCapsLock() {
  const [capsLockOn, setCapsLockOn] = useState(false);

  const trackCapsLock = (event) => {
    if (typeof event.getModifierState === 'function') {
      setCapsLockOn(event.getModifierState('CapsLock'));
    }
  };

  return { capsLockOn, trackCapsLock };
}
