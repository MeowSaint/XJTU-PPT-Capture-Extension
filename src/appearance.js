(() => {
  'use strict';
  const root = document.documentElement;
  const storageKey = 'ppt-capture-theme';
  const system = matchMedia('(prefers-color-scheme: dark)');
  let preference = null;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch (_) { /* A blocked store still allows a theme for this page. */ }

  function apply(theme) {
    root.dataset.theme = theme;
    const button = document.getElementById('theme-toggle');
    if (button) {
      button.setAttribute('aria-checked', String(theme === 'dark'));
      button.title = theme === 'dark' ? '切换浅色模式' : '切换深色模式';
    }
  }
  apply(preference || (system.matches ? 'dark' : 'light'));
  system.addEventListener('change', event => {
    if (!preference) apply(event.matches ? 'dark' : 'light');
  });

  document.addEventListener('DOMContentLoaded', () => {
    apply(root.dataset.theme);
    document.getElementById('theme-toggle').addEventListener('click', event => {
      preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
      apply(preference);
      try { localStorage.setItem(storageKey, preference); }
      catch (_) { event.currentTarget.title += '（仅本次生效）'; }
    });

    // Capture also receives scroll events from independently scrolling panels.
    const timers = new Map();
    document.addEventListener('scroll', event => {
      const target = event.target === document ? root : event.target;
      if (!(target instanceof Element)) return;
      target.classList.add('is-scrolling');
      clearTimeout(timers.get(target));
      timers.set(target, setTimeout(() => {
        target.classList.remove('is-scrolling');
        timers.delete(target);
      }, 800));
    }, {capture: true, passive: true});
    window.addEventListener('pagehide', () => {
      for (const [target, timer] of timers) {
        clearTimeout(timer);
        target.classList.remove('is-scrolling');
      }
      timers.clear();
    });
  }, {once: true});
})();
