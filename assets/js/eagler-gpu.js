/* Flash Games — read-only GPU status for Eaglercraft.
 *
 * Eaglercraft chooses its own WebGL version, context attributes and VSync
 * pacing. This module only inspects the device for the launcher/player status
 * chip; it must never patch canvas context creation or eaglercraftXOpts.
 */
(() => {
  'use strict';

  let cached = null;
  let pending = null;

  const clean = (value) => String(value ?? '').trim();
  const EAGLER_TARGET = /(?:^|[^a-z0-9])(eaglercraft|eagler|pixelclient|astraclient|shadownet|tuff[ _-]?client|resent[ _-]?client|wurst)/i;
  const EAGLER_FILE = /\/offline\/(?:1\.21|26\.2|26\.3)\.html?(?:$|[?#])/i;
  const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|mesa offscreen|apple software/i;

  function isEagler(game, source = '', doc = '') {
    const tags = Array.isArray(game?.tags) ? game.tags.join(' ') : '';
    const label = [
      game?.zone, game?.category, game?.source, game?.name, game?.title,
      tags, game?.rawUrl, game?.url, source
    ].filter(Boolean).join(' ');
    if (clean(game?.zone).toUpperCase() === 'EAGLERCRAFT' || EAGLER_TARGET.test(label) || EAGLER_FILE.test(label)) return true;
    // A client cached without its manifest metadata still identifies itself in
    // the first boot script. Only inspect the head so a 50 MB payload is cheap.
    return !!doc && /eaglercraftXOpts|eaglercraftXIwaBundleURL|EaglercraftX/i.test(String(doc).slice(0, 2500000));
  }

  function detect() {
    if (cached) return Promise.resolve(cached);
    if (pending) return pending;
    pending = Promise.resolve().then(() => {
      const profile = {
        version: 1, at: Date.now(), webgl: false, webgl2: false, software: true,
        renderer: 'Unknown GPU', vendor: '',
        cores: Number(navigator.hardwareConcurrency) || 0,
        memory: Number(navigator.deviceMemory) || 0
      };
      let gl = null;
      let canvas = null;
      try {
        canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        // Use default attributes: this probe must not change GPU selection or
        // create a high-performance context before the game boots.
        try {
          gl = canvas.getContext('webgl2');
          profile.webgl2 = !!gl;
        } catch {}
        if (!gl) {
          try { gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl'); } catch {}
        }
        if (gl) {
          profile.webgl = true;
          try {
            const info = gl.getExtension('WEBGL_debug_renderer_info');
            if (info) {
              profile.renderer = clean(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || 'Unknown GPU';
              profile.vendor = clean(gl.getParameter(info.UNMASKED_VENDOR_WEBGL));
            } else {
              profile.renderer = clean(gl.getParameter(gl.RENDERER)) || 'Unknown GPU';
              profile.vendor = clean(gl.getParameter(gl.VENDOR));
            }
          } catch {}
          profile.renderer = profile.renderer.slice(0, 180);
          profile.vendor = profile.vendor.slice(0, 120);
          profile.software = SOFTWARE_GPU.test(`${profile.renderer} ${profile.vendor}`);
          try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch {}
        }
      } catch {}
      try { if (canvas) { canvas.width = canvas.height = 0; canvas = null; } } catch {}
      cached = profile;
      pending = null;
      return profile;
    }).catch(() => {
      cached = { version: 1, at: Date.now(), webgl: false, webgl2: false, software: true, renderer: 'GPU detection unavailable', vendor: '', cores: 0, memory: 0 };
      pending = null;
      return cached;
    });
    return pending;
  }

  window.FlashEaglerGPU = Object.freeze({
    isEagler,
    detect,
    cached: () => cached
  });
})();
