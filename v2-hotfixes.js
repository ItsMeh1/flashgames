(() => {
  'use strict';
  // Compatibility shim: v2-hotfixes previously mounted Lumin in normal mode.
  // Lumin now lives only in app.js and is initialized once in headless mode.
  // Keep this file intentionally inert so stale HTML/service-worker references cannot create duplicate SDK instances.
})();
