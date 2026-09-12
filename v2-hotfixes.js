(() => {
  'use strict';
  const scripts = [
    ['./online-cache.js', 'flashOnlineCache'],
    ['./auth-recovery.js', 'flashAuthRecovery']
  ];
  for (const [src, key] of scripts) {
    if (document.querySelector(`script[data-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}]`)) continue;
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.dataset[key] = '1';
    document.head.appendChild(script);
  }
  if (!document.querySelector('link[data-flash-admin-panel]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = './admin-panel.css';
    link.dataset.flashAdminPanel = '1';
    document.head.appendChild(link);
  }
})();
