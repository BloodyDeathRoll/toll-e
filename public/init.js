// Pre-hydration init, loaded via next/script beforeInteractive (layout.tsx).
// 1. Theme: system preference unless the user chose one ('system' and an
//    unset key both mean the OS decides); applied before paint so the SSR
//    light default never flashes wrong. The media listener stays attached so
//    a 'system' page follows the OS flipping under it. Same for privacy.
// 2. Install: Chrome's install offer can fire before the bundle parses and is
//    only usable later if preventDefault() runs synchronously — stash it for
//    lib/install.ts. The service worker registration (with the manifest) is
//    what makes Chrome consider the app installable at all.
try {
  var mq = matchMedia('(prefers-color-scheme: dark)');
  var applyTheme = function () {
    var t = localStorage.getItem('toll-e.theme');
    document.documentElement.classList.toggle('dark', t === 'dark' || (t !== 'light' && mq.matches));
  };
  applyTheme();
  mq.addEventListener('change', applyTheme);
  if (localStorage.getItem('toll-e.privacy') === 'on')
    document.documentElement.dataset.privacy = 'on';
} catch {}
window.__TOLLE_BIP = null;
addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  window.__TOLLE_BIP = e;
  dispatchEvent(new Event('toll-e:installable'));
});
if ('serviceWorker' in navigator) {
  addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}
