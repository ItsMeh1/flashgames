(() => {
  'use strict';
  // Compatibility shim remains inert for the old Lumin behavior.
  // Phase 2 additionally loads the isolated online-game cache bridge.
  if (!document.querySelector('script[data-flash-online-cache]')) {
    const script = document.createElement('script');
    script.src = './online-cache.js';
    script.defer = true;
    script.dataset.flashOnlineCache = '1';
    document.head.appendChild(script);
  }
})();
