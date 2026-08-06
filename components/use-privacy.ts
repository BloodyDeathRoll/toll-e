'use client';

import { useEffect, useState } from 'react';

// Number privacy (toll-e-plan.md §2.2 Settings): blurs elements carrying the
// `private` class via html[data-privacy='on'] CSS — see globals.css. State
// lives on <html> + localStorage (restored pre-paint by the layout script);
// a window event keeps every toggle button in sync.

const EVENT = 'toll-e-privacy';

export function usePrivacy() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const read = () => setOn(document.documentElement.dataset.privacy === 'on');
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);

  const toggle = () => {
    const next = document.documentElement.dataset.privacy === 'on' ? 'off' : 'on';
    document.documentElement.dataset.privacy = next;
    localStorage.setItem('toll-e.privacy', next);
    window.dispatchEvent(new Event(EVENT));
  };

  return { on, toggle };
}
