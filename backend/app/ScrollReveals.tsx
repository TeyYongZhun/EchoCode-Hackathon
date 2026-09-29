'use client';

import { useEffect } from 'react';

/**
 * Renders nothing. It fades sections in as they're scrolled to, and tells the nav when
 * the page has moved.
 *
 * The CSS only hides a section once this has set `data-reveal-ready`, so with no
 * JavaScript — or if this never runs — everything is simply visible. Content is never
 * left waiting behind an observer.
 */
export function ScrollReveals() {
  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    root.dataset.revealReady = '';

    const watcher = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('in');
          watcher.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -10%' },
    );
    for (const el of document.querySelectorAll('[data-reveal]')) watcher.observe(el);

    const onScroll = () => {
      if (window.scrollY > 8) root.dataset.scrolled = '';
      else delete root.dataset.scrolled;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      watcher.disconnect();
      window.removeEventListener('scroll', onScroll);
      delete root.dataset.revealReady;
      delete root.dataset.scrolled;
    };
  }, []);

  return null;
}
