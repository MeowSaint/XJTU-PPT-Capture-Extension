/* Small, interruptible presentation feedback; never part of task or persistence state. */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), running = new Map();
  function cancel(element) {
    const animation = running.get(element);
    if (!animation) return;
    running.delete(element); animation.cancel();
  }
  function cancelAll() { for (const element of running.keys()) cancel(element); }
  function reveal(element, {x = 0, y = 6, duration = 180} = {}) {
    if (!element) return;
    // Read the rendered values before cancelling, so rapid reversals do not jump back.
    const previous = running.has(element) ? getComputedStyle(element) : null;
    const from = previous && {transform: previous.transform, opacity: previous.opacity};
    cancel(element);
    if (reduced.matches || !element.isConnected || !element.getClientRects().length) return;
    const target = getComputedStyle(element), transform = target.transform, opacity = target.opacity;
    const animation = element.animate([
      from || {transform: `translate(${x}px, ${y}px) ${transform === 'none' ? '' : transform}`, opacity: String(Number(opacity) * .72)},
      {transform, opacity}
    ], {duration, easing: 'cubic-bezier(.2,.7,.2,1)'});
    running.set(element, animation);
    animation.onfinish = () => { if (running.get(element) === animation) cancel(element); };
  }
  window.PPTMotion = {reveal, cancel, cancelAll};
  reduced.addEventListener('change', cancelAll);
  window.addEventListener('pagehide', cancelAll);
  // Keep native open/close and focus synchronous. Only their presentation follows.
  const observer = new MutationObserver(records => {
    for (const node of new Set(records.map(record => record.target))) {
      const content = node.matches('details') ? node.querySelector('.drawer-body') : node;
      if (node.open) reveal(content, {duration: 160});
      else for (const element of running.keys()) if (node === element || node.contains(element)) cancel(element);
    }
  });
  for (const node of document.querySelectorAll('details, dialog')) observer.observe(node, {attributes: true, attributeFilter: ['open']});
})();
