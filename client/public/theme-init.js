// Applies the saved light/dark theme to <html> BEFORE first paint (no flash). This lives in an EXTERNAL file
// (served from /theme-init.js) rather than inline in index.html on purpose: the production CSP is
// `script-src 'self'` (no 'unsafe-inline'), which BLOCKS inline <script> — an earlier inline version was
// silently blocked in prod, so the chosen theme reverted to light on every refresh. A same-origin external
// script is allowed. Mirrors client/src/stores/theme-store.ts (which re-applies it once the bundle loads).
(function () {
  try {
    var t = localStorage.getItem('theme') || 'system';
    var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) { /* localStorage blocked — fall back to light */ }
})();
