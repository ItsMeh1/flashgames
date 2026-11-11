/* Flash Games — automatic GPU tuning for Eaglercraft.
 *
 * Eaglercraft renders through WebGL, not WebGPU. The useful win available to
 * the launcher is to create every game context on the high-performance GPU,
 * prefer WebGL 2 when the browser supports it, and turn off context features
 * the game does not need (MSAA, preserved back buffers, compositor sync).
 *
 * This file has two jobs:
 *  1. inspect the device GPU for the launcher/player status chip
 *  2. supply the tiny runtime that is inserted before a cached client boots
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
        const attrs = {
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: false,
          antialias: false,
          alpha: false,
          depth: true
        };
        try {
          gl = canvas.getContext('webgl2', attrs);
          profile.webgl2 = !!gl;
        } catch {}
        if (!gl) {
          try { gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs); } catch {}
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

  // Runs inside the client iframe before any Eaglercraft script. Keep it ES5
  // and self-contained so it also works while the app is offline.
  const RUNTIME = `<script data-flash-eagler-gpu>
(function () {
  'use strict';
  if (window.__FLASH_EAGLER_GPU__) return;
  var probe = null, gl = null, webgl2 = false, renderer = '', vendor = '';
  try {
    probe = document.createElement('canvas');
    probe.width = probe.height = 32;
    var probeAttrs = { powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false, antialias: false, alpha: false, depth: true };
    try {
      gl = probe.getContext('webgl2', probeAttrs);
      webgl2 = !!gl;
    } catch (e) {}
    if (!gl) {
      try { gl = probe.getContext('webgl', probeAttrs) || probe.getContext('experimental-webgl', probeAttrs); } catch (e) {}
    }
    if (gl) {
      try {
        var info = gl.getExtension('WEBGL_debug_renderer_info');
        if (info) {
          renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) || '');
          vendor = String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL) || '');
        } else {
          renderer = String(gl.getParameter(gl.RENDERER) || '');
          vendor = String(gl.getParameter(gl.VENDOR) || '');
        }
      } catch (e) {}
      try { var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (e) {}
    }
  } catch (e) {}
  try { if (probe) { probe.width = probe.height = 0; probe = null; } } catch (e) {}

  var software = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|mesa offscreen|apple software/i.test(renderer + ' ' + vendor);
  var stats = window.__FLASH_EAGLER_GPU__ = {
    active: true, webgl2: webgl2, webgl: !!gl, software: software,
    renderer: renderer || 'Unknown GPU', vendor: vendor, tunedContexts: 0
  };
  try {
    document.documentElement.setAttribute('data-flash-eagler-gpu', 'on');
    if (webgl2) document.documentElement.setAttribute('data-flash-eagler-webgl2', 'on');
  } catch (e) {}

  var GPU_ATTRS = {
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
    antialias: false,
    desynchronized: true
  };
  function tune(type, attrs) {
    if (type !== 'webgl' && type !== 'webgl2' && type !== 'experimental-webgl') return attrs;
    var next = {};
    if (attrs && typeof attrs === 'object') {
      var keys = Object.keys(attrs);
      for (var i = 0; i < keys.length; i++) next[keys[i]] = attrs[keys[i]];
    }
    for (var key in GPU_ATTRS) next[key] = GPU_ATTRS[key];
    if (!Object.prototype.hasOwnProperty.call(next, 'preserveDrawingBuffer')) next.preserveDrawingBuffer = false;
    stats.tunedContexts++;
    return next;
  }
  function patch(proto) {
    if (!proto || typeof proto.getContext !== 'function') return;
    var original = proto.getContext;
    proto.getContext = function (type, attrs) {
      try { attrs = tune(type, attrs); } catch (e) {}
      return original.call(this, type, attrs);
    };
  }
  patch(window.HTMLCanvasElement && HTMLCanvasElement.prototype);
  patch(window.OffscreenCanvas && OffscreenCanvas.prototype);

  // Merge the launch options modern EaglercraftX builds already understand.
  // Context patching above still covers clients that ignore these keys.
  function tuneOptions(opts) {
    if (!opts || typeof opts !== 'object') return opts;
    try {
      if (webgl2 && opts.forceWebGL1 !== true) opts.forceWebGL2 = true;
      var rendering = opts.rendering;
      if (rendering && typeof rendering === 'object' && rendering.contextAttributes && typeof rendering.contextAttributes === 'object') {
        rendering.contextAttributes.powerPreference = 'high-performance';
        rendering.contextAttributes.antialias = false;
        rendering.contextAttributes.failIfMajorPerformanceCaveat = false;
      }
    } catch (e) {}
    return opts;
  }
  try {
    var current = null;
    Object.defineProperty(window, 'eaglercraftXOpts', {
      configurable: true,
      enumerable: true,
      get: function () { return current; },
      set: function (value) { current = tuneOptions(value); }
    });
  } catch (e) {}
})();
<\/script>`;

  window.FlashEaglerGPU = Object.freeze({
    isEagler,
    detect,
    cached: () => cached,
    inlineScript: () => RUNTIME
  });
})();
